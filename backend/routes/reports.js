const express = require("express");
const ExcelJS = require("exceljs");
const pool = require("../db");

const router = express.Router();

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function getSettings(teacherId) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_preferences (
      teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
      question_bank JSONB NOT NULL DEFAULT '{}'::jsonb,
      report_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE teacher_preferences ADD COLUMN IF NOT EXISTS report_settings JSONB NOT NULL DEFAULT '{}'::jsonb`);
  const { rows } = await pool.query(
    `SELECT t.name, p.report_settings FROM teachers t
     LEFT JOIN teacher_preferences p ON p.teacher_id=t.id WHERE t.id=$1`,
    [teacherId]
  );
  const saved = rows[0]?.report_settings || {};
  return {
    schoolName: saved.schoolName || "",
    educationDepartment: saved.educationDepartment || "",
    educationOffice: saved.educationOffice || "",
    teacherName: saved.teacherName || rows[0]?.name || "",
    principalName: saved.principalName || "",
    academicYear: saved.academicYear || "",
    semester: saved.semester || "الأول",
    logoType: saved.logoType || "ksa",
    logoData: saved.logoData || "",
  };
}

function logoSource(settings) {
  if (settings.logoType === "custom" && settings.logoData?.startsWith("data:image/")) return settings.logoData;
  return "https://upload.wikimedia.org/wikipedia/commons/9/99/Emblem_of_Saudi_Arabia.svg";
}

function bool(queryValue, fallback = true) {
  if (queryValue === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(String(queryValue).toLowerCase());
}

function pageShell({ title, settings, body, signatures = false, exam = false, query = {} }) {
  const showSchool = bool(query.showSchool, true);
  const showMadar = bool(query.showMadar, true);
  const printedAt = new Date().toLocaleDateString("ar-SA");
  const office = settings.educationOffice ? `<div>مكتب التعليم: ${esc(settings.educationOffice)}</div>` : "";
  const schoolBlock = showSchool
    ? `<div class="official-side"><img src="${esc(logoSource(settings))}" alt="الشعار الرسمي"><div><strong>المملكة العربية السعودية</strong><span>وزارة التعليم</span><span>إدارة التعليم: ${esc(settings.educationDepartment)}</span>${office}<span>المدرسة: ${esc(settings.schoolName)}</span></div></div>`
    : `<div></div>`;
  const madarBlock = showMadar
    ? `<div class="madar-brand"><div class="madar-word">مدار</div><div>منصة مدار التعليمية</div></div>`
    : `<div class="madar-brand"></div>`;
  const docBlock = `<div class="doc-side"><h1>${esc(title)}</h1><span>العام الدراسي: ${esc(settings.academicYear)}</span><span>الفصل الدراسي ${esc(settings.semester)}</span></div>`;
  const signaturesHtml = signatures
    ? `<section class="signatures"><div><b>توقيع المعلمة</b><span>${esc(settings.teacherName)}</span></div><div><b>توقيع مديرة المدرسة</b><span>${esc(settings.principalName)}</span></div><div><b>الختم</b><span class="stamp-space"></span></div></section>`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/teacher/print-report.css"></head><body>
  <div class="print-toolbar"><button onclick="window.print()">طباعة / حفظ PDF</button><button onclick="history.back()">رجوع</button></div>
  <main class="report-page ${exam ? "exam-page" : ""}">
    <header class="official-header">${schoolBlock}${madarBlock}${docBlock}</header>
    <div class="purple-rule"></div>
    <section class="report-body">${body}</section>
    ${signaturesHtml}
    <footer class="report-footer"><span>مدار | منصة الرياضيات التفاعلية</span><span>إعداد المعلمة: ${esc(settings.teacherName)}</span><span>تاريخ الطباعة: ${printedAt}</span><span class="page-number"></span></footer>
  </main></body></html>`;
}

function examInfo(test, query) {
  const items = [
    `<div><b>اسم الطالبة:</b> ____________________</div>`,
    `<div><b>الصف:</b> ${esc(query.grade || "__________")}</div>`,
    `<div><b>الفصل:</b> ${esc(test.class_name || "__________")}</div>`,
    `<div><b>المادة:</b> الرياضيات</div>`,
  ];
  if (bool(query.showDate, true)) items.push(`<div><b>التاريخ:</b> __________</div>`);
  if (bool(query.showDuration, true)) items.push(`<div><b>الزمن:</b> ${test.duration_minutes || 20} دقيقة</div>`);
  if (bool(query.showScore, true)) items.push(`<div><b>الدرجة:</b> ____ / ${test.total_points || 0}</div>`);
  if (query.model) items.push(`<div><b>النموذج:</b> ${esc(query.model)}</div>`);
  return `<section class="exam-info">${items.join("")}</section>`;
}

function optionList(options, answerMode, correctAnswer) {
  if (!Array.isArray(options) || !options.length) return `<div class="answer-space"></div>`;
  return `<ol class="options">${options.map((o) => `<li class="${answerMode && String(o) === String(correctAnswer) ? "correct-option" : ""}">${esc(o)}${answerMode && String(o) === String(correctAnswer) ? " ✓" : ""}</li>`).join("")}</ol>`;
}

async function testData(id) {
  const { rows: tests } = await pool.query(`SELECT t.*,c.name AS class_name FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.id=$1`, [id]);
  const test = tests[0];
  if (!test) return null;
  const { rows: questions } = await pool.query(`SELECT * FROM questions WHERE test_id=$1 ORDER BY order_index`, [id]);
  return { test, questions };
}

router.get("/students.xlsx", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT s.name,s.email,c.name AS class_name,s.level,s.progress_percent,s.last_active FROM students s LEFT JOIN classes c ON c.id=s.class_id ORDER BY s.name`);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("الطالبات");
    sheet.views = [{ rightToLeft: true }];
    sheet.columns = [
      { header: "الاسم", key: "name", width: 25 }, { header: "البريد الإلكتروني", key: "email", width: 28 },
      { header: "الفصل", key: "class_name", width: 20 }, { header: "المستوى", key: "level", width: 15 },
      { header: "نسبة التقدم", key: "progress_percent", width: 15 }, { header: "آخر نشاط", key: "last_active", width: 20 },
    ];
    rows.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=students-report.xlsx");
    await workbook.xlsx.write(res); res.end();
  } catch (err) { console.error(err); res.status(500).json({ error: "تعذّر تصدير التقرير." }); }
});

router.get("/student/:id/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const { rows: studentRows } = await pool.query(`SELECT s.*,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=$1`, [req.params.id]);
    const student = studentRows[0]; if (!student) return res.status(404).send("الطالبة غير موجودة");
    const [{ rows: results }, { rows: attendance }, { rows: assignments }] = await Promise.all([
      pool.query(`SELECT t.title,tr.score,t.total_points,tr.status FROM test_results tr JOIN tests t ON t.id=tr.test_id WHERE tr.student_id=$1 ORDER BY tr.created_at DESC`, [req.params.id]),
      pool.query(`SELECT date,status FROM attendance WHERE student_id=$1 ORDER BY date DESC LIMIT 30`, [req.params.id]),
      pool.query(`SELECT title,status,due_date FROM assignments WHERE student_id=$1 ORDER BY due_date DESC`, [req.params.id]),
    ]);
    const resultRows = results.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.title)}</td><td>${r.status === "completed" ? `${r.score}/${r.total_points}` : "لم تُنجز"}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد نتائج مسجلة</td></tr>`;
    const body = `<div class="info-grid"><div><b>اسم الطالبة:</b> ${esc(student.name)}</div><div><b>الصف والفصل:</b> ${esc(student.level)} - ${esc(student.class_name || "—")}</div><div><b>المعلمة:</b> ${esc(settings.teacherName)}</div><div><b>الفترة:</b> الفصل الدراسي ${esc(settings.semester)}</div></div><h2>نتائج الاختبارات</h2><table><thead><tr><th>م</th><th>الاختبار</th><th>الدرجة</th></tr></thead><tbody>${resultRows}</tbody></table><h2>ملخص المتابعة</h2><div class="summary-boxes"><div>الحضور<br><b>${attendance.filter((a) => a.status === "present").length}</b></div><div>الغياب<br><b>${attendance.filter((a) => a.status === "absent").length}</b></div><div>التأخر<br><b>${attendance.filter((a) => a.status === "late").length}</b></div><div>الواجبات<br><b>${assignments.length}</b></div></div>`;
    res.send(pageShell({ title: "سجل متابعة الطالبة", settings, body, signatures: true, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});
router.get("/student/:id.pdf", (req, res) => res.redirect(`/api/teacher/reports/student/${req.params.id}/print`));

router.get("/class/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const params = [], where = req.query.classId ? "WHERE s.class_id=$1" : ""; if (req.query.classId) params.push(Number(req.query.classId));
    const { rows } = await pool.query(`SELECT s.name,s.level,s.progress_percent,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id ${where} ORDER BY s.name`, params);
    const title = req.query.title || "كشف متابعة الفصل";
    const tableRows = rows.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.class_name || "—")}</td><td>${esc(s.level)}</td><td>${s.progress_percent}%</td></tr>`).join("") || `<tr><td colspan="5">لا توجد طالبات</td></tr>`;
    const body = `<div class="info-grid"><div><b>المعلمة:</b> ${esc(settings.teacherName)}</div><div><b>الفترة:</b> الفصل الدراسي ${esc(settings.semester)}</div></div><table><thead><tr><th>م</th><th>اسم الطالبة</th><th>الفصل</th><th>المرحلة</th><th>نسبة التقدم</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    res.send(pageShell({ title, settings, body, signatures: true, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});
router.get("/class.pdf", (req, res) => res.redirect(`/api/teacher/reports/class/print${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));

router.get("/followup/:kind/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const labels = { attendance: "سجل الحضور", assignments: "سجل الواجبات", participation: "سجل المشاركة", tasks: "سجل المهام" };
    const title = labels[req.params.kind]; if (!title) return res.status(404).send("نوع السجل غير موجود");
    const params = [], where = req.query.classId ? "WHERE s.class_id=$1" : ""; if (req.query.classId) params.push(Number(req.query.classId));
    const { rows } = await pool.query(`SELECT s.id,s.name,s.level,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id ${where} ORDER BY s.name`, params);
    const columns = Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("");
    const tableRows = rows.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td>${Array.from({ length: 10 }, () => `<td></td>`).join("")}</tr>`).join("") || `<tr><td colspan="12">لا توجد طالبات</td></tr>`;
    const body = `<div class="info-grid"><div><b>المعلمة:</b> ${esc(settings.teacherName)}</div><div><b>الصف والفصل:</b> ${esc(req.query.className || "__________")}</div><div><b>الفترة:</b> الفصل الدراسي ${esc(settings.semester)}</div><div><b>نوع السجل:</b> ${title}</div></div><table class="followup-table"><thead><tr><th>م</th><th>اسم الطالبة</th>${columns}</tr></thead><tbody>${tableRows}</tbody></table>`;
    res.send(pageShell({ title, settings, body, signatures: true, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء السجل"); }
});

router.get("/test/:id/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const data = await testData(req.params.id); if (!data) return res.status(404).send("الاختبار غير موجود");
    let questions = [...data.questions];
    if (bool(req.query.shuffle, false)) questions.sort((a, b) => String(a.question_text).localeCompare(String(b.question_text), "ar") * (req.query.model === "ب" ? -1 : 1));
    const answerMode = req.query.mode === "answers";
    const qHtml = questions.map((q, i) => `<article class="question"><div class="question-title"><b>${i + 1}. ${esc(q.question_text)}</b><span>${q.points} درجة</span></div>${optionList(q.options, answerMode, q.correct_answer)}${answerMode && !Array.isArray(q.options) ? `<div class="model-answer"><b>الإجابة:</b> ${esc(q.correct_answer)}</div>` : ""}</article>`).join("");
    const title = answerMode ? `${data.test.title} — نموذج الإجابة` : data.test.title;
    const body = `${examInfo(data.test, req.query)}${qHtml || "لا توجد أسئلة"}`;
    res.send(pageShell({ title, settings, body, exam: true, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});

router.get("/test/:id/results/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const data = await testData(req.params.id); if (!data) return res.status(404).send("الاختبار غير موجود");
    const { rows } = await pool.query(`SELECT s.name,c.name AS class_name,tr.status,tr.score,tr.submitted_at FROM test_results tr JOIN students s ON s.id=tr.student_id LEFT JOIN classes c ON c.id=s.class_id WHERE tr.test_id=$1 ORDER BY s.name`, [req.params.id]);
    const trs = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.class_name || "—")}</td><td>${r.status === "completed" ? `${r.score}/${data.test.total_points}` : "لم يكتمل"}</td><td>${data.test.total_points ? Math.round((Number(r.score || 0) / data.test.total_points) * 100) : 0}%</td></tr>`).join("") || `<tr><td colspan="5">لا توجد نتائج</td></tr>`;
    res.send(pageShell({ title: `${data.test.title} — نتائج الطالبات`, settings, body: `<table><thead><tr><th>م</th><th>اسم الطالبة</th><th>الفصل</th><th>الدرجة</th><th>النسبة</th></tr></thead><tbody>${trs}</tbody></table>`, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء النتائج"); }
});

router.get("/test/:id/analysis/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId);
    const data = await testData(req.params.id); if (!data) return res.status(404).send("الاختبار غير موجود");
    const { rows } = await pool.query(`SELECT q.order_index,q.question_text,q.points,COUNT(a.id)::int AS answer_count,COUNT(a.id) FILTER (WHERE a.is_correct=true)::int AS correct_count FROM questions q LEFT JOIN answers a ON a.question_id=q.id WHERE q.test_id=$1 GROUP BY q.id ORDER BY q.order_index`, [req.params.id]);
    const trs = rows.map((r) => `<tr><td>${r.order_index}</td><td>${esc(r.question_text)}</td><td>${r.answer_count}</td><td>${r.correct_count}</td><td>${r.answer_count ? Math.round((r.correct_count / r.answer_count) * 100) : 0}%</td></tr>`).join("") || `<tr><td colspan="5">لا توجد بيانات تحليل</td></tr>`;
    res.send(pageShell({ title: `${data.test.title} — تحليل الاختبار`, settings, body: `<table><thead><tr><th>م</th><th>السؤال</th><th>الإجابات</th><th>الصحيحة</th><th>نسبة الصحة</th></tr></thead><tbody>${trs}</tbody></table>`, query: req.query }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء التحليل"); }
});

module.exports = router;
