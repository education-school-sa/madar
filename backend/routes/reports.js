const express = require("express");
const ExcelJS = require("exceljs");
const pool = require("../db");

const router = express.Router();

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function getSettings(teacherId, query = {}) {
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
     LEFT JOIN teacher_preferences p ON p.teacher_id = t.id WHERE t.id = $1`,
    [teacherId]
  );
  const saved = rows[0]?.report_settings || {};
  return {
    schoolName: query.schoolName || saved.schoolName || "",
    educationDepartment: query.educationDepartment || saved.educationDepartment || "",
    educationOffice: query.educationOffice || saved.educationOffice || "",
    teacherName: query.teacherName || saved.teacherName || rows[0]?.name || "",
    academicYear: query.academicYear || saved.academicYear || "",
    principalName: query.principalName || saved.principalName || "",
  };
}

function officialPage({ title, settings, body, signatures = false }) {
  const office = settings.educationOffice ? `<div>مكتب التعليم: ${esc(settings.educationOffice)}</div>` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/teacher/print-report.css"></head><body>
  <div class="print-toolbar"><button onclick="window.print()">طباعة / حفظ PDF</button><button onclick="history.back()">رجوع</button></div>
  <main class="report-page">
    <header class="official-header">
      <img class="ksa-emblem" src="https://upload.wikimedia.org/wikipedia/commons/9/99/Emblem_of_Saudi_Arabia.svg" alt="شعار المملكة العربية السعودية">
      <div class="ministry-data"><strong>المملكة العربية السعودية</strong><div>وزارة التعليم</div><div>إدارة التعليم: ${esc(settings.educationDepartment || "—")}</div><div>المدرسة: ${esc(settings.schoolName || "—")}</div>${office}</div>
      <div class="document-title"><h1>${esc(title)}</h1><div>العام الدراسي: ${esc(settings.academicYear || "—")}</div></div>
    </header>
    <section class="report-body">${body}</section>
    ${signatures ? `<section class="signatures"><div><strong>توقيع المعلمة</strong><span>${esc(settings.teacherName || "")}</span></div><div><strong>توقيع مديرة المدرسة</strong><span>${esc(settings.principalName || "")}</span></div><div><strong>الختم</strong><span class="stamp-space"></span></div></section>` : ""}
    <footer class="report-footer"><strong>مدار</strong><span>تم إنشاء التقرير بواسطة منصة مدار التعليمية</span></footer>
  </main></body></html>`;
}

router.get("/students.xlsx", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT s.name, s.email, c.name AS class_name, s.level, s.progress_percent, s.last_active FROM students s LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.name`);
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
    const settings = await getSettings(req.session.teacherId, req.query);
    const { rows: studentRows } = await pool.query(`SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=$1`, [req.params.id]);
    const student = studentRows[0]; if (!student) return res.status(404).send("الطالبة غير موجودة");
    const [{ rows: results }, { rows: attendance }, { rows: assignments }] = await Promise.all([
      pool.query(`SELECT t.title,tr.score,t.total_points,tr.status FROM test_results tr JOIN tests t ON t.id=tr.test_id WHERE tr.student_id=$1 ORDER BY tr.created_at DESC`, [req.params.id]),
      pool.query(`SELECT date,status FROM attendance WHERE student_id=$1 ORDER BY date DESC LIMIT 30`, [req.params.id]),
      pool.query(`SELECT title,status,due_date FROM assignments WHERE student_id=$1 ORDER BY due_date DESC`, [req.params.id]),
    ]);
    const rows = results.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.title)}</td><td>${r.status === "completed" ? `${r.score}/${r.total_points}` : "لم تُنجز"}</td></tr>`).join("") || `<tr><td colspan="3">لا توجد نتائج مسجلة</td></tr>`;
    const present = attendance.filter((a) => a.status === "present").length, absent = attendance.filter((a) => a.status === "absent").length, late = attendance.filter((a) => a.status === "late").length;
    const body = `<div class="info-grid"><div><b>اسم الطالبة:</b> ${esc(student.name)}</div><div><b>الفصل:</b> ${esc(student.class_name || "—")}</div><div><b>المرحلة:</b> ${esc(student.level)}</div><div><b>نسبة التقدم:</b> ${student.progress_percent}%</div></div><h2>نتائج الاختبارات</h2><table><thead><tr><th>م</th><th>الاختبار</th><th>الدرجة</th></tr></thead><tbody>${rows}</tbody></table><h2>الحضور والواجبات</h2><div class="summary-boxes"><div>حاضرة<br><b>${present}</b></div><div>غائبة<br><b>${absent}</b></div><div>متأخرة<br><b>${late}</b></div><div>الواجبات<br><b>${assignments.length}</b></div></div>`;
    res.send(officialPage({ title: "سجل متابعة الطالبة", settings, body, signatures: true }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});
router.get("/student/:id.pdf", (req, res) => res.redirect(`/api/teacher/reports/student/${req.params.id}/print`));

router.get("/class/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId, req.query);
    const params = [], where = req.query.classId ? "WHERE s.class_id=$1" : ""; if (req.query.classId) params.push(Number(req.query.classId));
    const { rows } = await pool.query(`SELECT s.name,s.level,s.progress_percent,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id ${where} ORDER BY s.name`, params);
    const title = req.query.title || "كشف متابعة الفصل";
    const tableRows = rows.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.class_name || "—")}</td><td>${esc(s.level)}</td><td>${s.progress_percent}%</td></tr>`).join("") || `<tr><td colspan="5">لا توجد طالبات</td></tr>`;
    const body = `<table><thead><tr><th>م</th><th>اسم الطالبة</th><th>الفصل</th><th>المرحلة</th><th>نسبة التقدم</th></tr></thead><tbody>${tableRows}</tbody></table>`;
    res.send(officialPage({ title, settings, body, signatures: true }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});
router.get("/class.pdf", (req, res) => res.redirect(`/api/teacher/reports/class/print${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`));

router.get("/test/:id/print", async (req, res) => {
  try {
    const settings = await getSettings(req.session.teacherId, req.query);
    const { rows: tests } = await pool.query(`SELECT t.*,c.name AS class_name FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.id=$1`, [req.params.id]);
    const test = tests[0]; if (!test) return res.status(404).send("الاختبار غير موجود");
    const { rows: questions } = await pool.query(`SELECT * FROM questions WHERE test_id=$1 ORDER BY order_index`, [req.params.id]);
    const qHtml = questions.map((q, i) => `<div class="question"><div><b>السؤال ${i + 1}:</b> ${esc(q.question_text)} <span class="points">(${q.points} درجة)</span></div>${Array.isArray(q.options) ? `<ol>${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>` : ""}</div>`).join("");
    const body = `<div class="info-grid"><div><b>الفصل:</b> ${esc(test.class_name || "جميع الفصول")}</div><div><b>المدة:</b> ${test.duration_minutes} دقيقة</div><div><b>الدرجة:</b> ${test.total_points}</div><div><b>اسم الطالبة:</b> ....................................</div></div>${qHtml || "لا توجد أسئلة"}`;
    res.send(officialPage({ title: req.query.title || test.title, settings, body, signatures: false }));
  } catch (err) { console.error(err); res.status(500).send("تعذّر إنشاء المعاينة"); }
});

module.exports = router;
