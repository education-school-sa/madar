const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const pool = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const VALID_TEST_TYPES = ["pre_diagnostic", "post_diagnostic", "quiz"];

async function ensureMetadataColumns() {
  await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS skill_name_text TEXT`);
  await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS unit_name TEXT`);
  await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS lesson_name TEXT`);
}

function value(row, names) {
  for (const name of names) {
    const v = row[name];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normalizeType(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (["mcq", "اختيار من متعدد", "اختيار", "multiple choice"].includes(v)) return "mcq";
  if (["true_false", "true/false", "صح أو خطأ", "صح وخطأ", "صح خطأ"].includes(v)) return "true_false";
  if (["short_answer", "إجابة قصيرة", "اجابة قصيرة", "short answer"].includes(v)) return "short_answer";
  return v || "mcq";
}

function parseOptions(row) {
  const direct = [1, 2, 3, 4, 5, 6]
    .map((n) => value(row, [`الخيار ${n}`, `خيار ${n}`, `option${n}`, `option_${n}`]))
    .filter(Boolean);
  if (direct.length) return direct;
  const combined = value(row, ["الخيارات", "options"]);
  return combined ? combined.split(/[|؛;]/).map((x) => x.trim()).filter(Boolean) : [];
}

async function workbookRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.text || cell.value || "").trim();
  });
  const rows = [];
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const item = {};
    headers.forEach((header, col) => {
      if (header) item[header] = excelRow.getCell(col).text || excelRow.getCell(col).value || "";
    });
    if (Object.values(item).some((v) => String(v || "").trim())) rows.push({ rowNumber, item });
  });
  return rows;
}

function normalizeRows(rawRows) {
  const seen = new Map();
  return rawRows.map(({ rowNumber, item }) => {
    const questionText = value(item, ["السؤال", "نص السؤال", "question", "question_text"]);
    const type = normalizeType(value(item, ["النوع", "نوع السؤال", "type"]));
    const options = parseOptions(item);
    let correctAnswer = value(item, ["الإجابة الصحيحة", "الاجابة الصحيحة", "correct_answer", "answer"]);
    if (type === "true_false") {
      const normalizedAnswer = correctAnswer.toLowerCase();
      if (["صح", "صحيح", "true", "1"].includes(normalizedAnswer)) correctAnswer = "true";
      if (["خطأ", "خطا", "false", "0"].includes(normalizedAnswer)) correctAnswer = "false";
    }
    const pointsRaw = value(item, ["الدرجة", "النقاط", "points", "score"]);
    const points = Math.max(1, Number(pointsRaw) || 1);
    const skill = value(item, ["المهارة", "skill"]);
    const unit = value(item, ["الوحدة", "unit"]);
    const lesson = value(item, ["الدرس", "lesson"]);
    const issues = [];

    if (!questionText) issues.push("نص السؤال ناقص");
    if (!["mcq", "true_false", "short_answer"].includes(type)) issues.push("نوع السؤال غير مدعوم");
    if (!correctAnswer) issues.push("الإجابة الصحيحة ناقصة");
    if (type === "mcq" && options.length < 2) issues.push("خيارات السؤال ناقصة");
    if (type === "mcq" && correctAnswer && !options.includes(correctAnswer)) issues.push("الإجابة الصحيحة غير موجودة ضمن الخيارات");

    const key = questionText.replace(/\s+/g, " ").trim().toLowerCase();
    if (key) {
      if (seen.has(key)) issues.push(`سؤال مكرر مع السطر ${seen.get(key)}`);
      else seen.set(key, rowNumber);
    }

    return { rowNumber, questionText, type, options, correctAnswer, points, skill, unit, lesson, issues };
  });
}

function styleWorksheet(sheet) {
  sheet.views = [{ rightToLeft: true }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(sheet.columnCount).address };
  sheet.columns.forEach((column) => {
    column.width = Math.min(45, Math.max(14, ...column.values.slice(1).map((v) => String(v || "").length + 2)));
  });
}

async function sendWorkbook(res, workbook, filename) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await workbook.xlsx.write(res);
  res.end();
}

router.get("/template.xlsx", async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("نموذج الأسئلة");
  sheet.columns = [
    { header: "السؤال", key: "question" },
    { header: "النوع", key: "type" },
    { header: "الخيار 1", key: "o1" },
    { header: "الخيار 2", key: "o2" },
    { header: "الخيار 3", key: "o3" },
    { header: "الخيار 4", key: "o4" },
    { header: "الإجابة الصحيحة", key: "answer" },
    { header: "الدرجة", key: "points" },
    { header: "المهارة", key: "skill" },
    { header: "الوحدة", key: "unit" },
    { header: "الدرس", key: "lesson" },
  ];
  sheet.addRow({ question: "ما ناتج ٢ + ٣؟", type: "اختيار من متعدد", o1: "٤", o2: "٥", o3: "٦", o4: "٧", answer: "٥", points: 1, skill: "الجمع", unit: "الأعداد", lesson: "جمع الأعداد" });
  sheet.addRow({ question: "العدد ٤ عدد زوجي.", type: "صح أو خطأ", answer: "true", points: 1, skill: "الأعداد الزوجية", unit: "الأعداد", lesson: "الزوجي والفردي" });
  styleWorksheet(sheet);
  await sendWorkbook(res, workbook, "نموذج-استيراد-أسئلة-مدار.xlsx");
});

router.post("/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "يرجى اختيار ملف Excel." });
    if (!req.file.originalname.toLowerCase().endsWith(".xlsx")) return res.status(400).json({ error: "يدعم الاستيراد ملفات XLSX فقط." });
    const rows = normalizeRows(await workbookRows(req.file.buffer));
    res.json({
      rows,
      validCount: rows.filter((r) => !r.issues.length).length,
      invalidCount: rows.filter((r) => r.issues.length).length,
      duplicateCount: rows.filter((r) => r.issues.some((x) => x.includes("مكرر"))).length,
    });
  } catch (err) {
    console.error("preview test excel error", err);
    res.status(500).json({ error: "تعذّرت قراءة ملف Excel. تحققي من النموذج والمحارف." });
  }
});

router.post("/adopt", async (req, res) => {
  const { title, type, classId, durationMinutes, rows = [] } = req.body || {};
  if (!title || !VALID_TEST_TYPES.includes(type)) return res.status(400).json({ error: "عنوان الاختبار ونوعه مطلوبان." });
  const validRows = rows.filter((row) => row.questionText && (!Array.isArray(row.issues) || !row.issues.length));
  if (!validRows.length) return res.status(400).json({ error: "لا توجد أسئلة سليمة لاعتمادها." });

  const client = await pool.connect();
  try {
    await ensureMetadataColumns();
    await client.query("BEGIN");
    const totalPoints = validRows.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    const { rows: testRows } = await client.query(
      `INSERT INTO tests (teacher_id, title, type, status, class_id, duration_minutes, total_points)
       VALUES ($1,$2,$3,'draft',$4,$5,$6) RETURNING *`,
      [req.session.teacherId, title.trim(), type, classId || null, Number(durationMinutes) || 20, totalPoints]
    );
    let order = 1;
    for (const q of validRows) {
      await client.query(
        `INSERT INTO questions
         (test_id, type, question_text, options, correct_answer, points, order_index, skill_name_text, unit_name, lesson_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [testRows[0].id, q.type, q.questionText, q.options?.length ? JSON.stringify(q.options) : null, q.correctAnswer, Number(q.points) || 1, order++, q.skill || null, q.unit || null, q.lesson || null]
      );
    }
    await client.query("INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)", [req.session.teacherId, "استيراد اختبار من Excel", `تم استيراد ${validRows.length} سؤالًا إلى الاختبار \"${title}\"`]);
    await client.query("COMMIT");
    res.status(201).json({ test: testRows[0], imported: validRows.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("adopt test excel error", err);
    res.status(500).json({ error: "تعذّر اعتماد أسئلة Excel." });
  } finally {
    client.release();
  }
});

router.get("/:id/questions.xlsx", async (req, res) => {
  try {
    await ensureMetadataColumns();
    const { rows: tests } = await pool.query("SELECT title FROM tests WHERE id=$1", [req.params.id]);
    if (!tests[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    const { rows } = await pool.query(
      `SELECT q.order_index, q.question_text, q.type, q.options, q.correct_answer, q.points,
              COALESCE(sk.name, q.skill_name_text) AS skill, q.unit_name, q.lesson_name
       FROM questions q LEFT JOIN skills sk ON sk.id=q.skill_id
       WHERE q.test_id=$1 ORDER BY q.order_index`,
      [req.params.id]
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("الأسئلة");
    sheet.columns = [
      { header: "م", key: "order_index" }, { header: "السؤال", key: "question_text" }, { header: "النوع", key: "type" },
      { header: "الخيارات", key: "options_text" }, { header: "الإجابة الصحيحة", key: "correct_answer" }, { header: "الدرجة", key: "points" },
      { header: "المهارة", key: "skill" }, { header: "الوحدة", key: "unit_name" }, { header: "الدرس", key: "lesson_name" },
    ];
    rows.forEach((r) => sheet.addRow({ ...r, options_text: Array.isArray(r.options) ? r.options.join(" | ") : "" }));
    styleWorksheet(sheet);
    await sendWorkbook(res, workbook, `${tests[0].title}-الأسئلة.xlsx`);
  } catch (err) {
    console.error("export questions error", err);
    res.status(500).json({ error: "تعذّر تصدير الأسئلة." });
  }
});

router.get("/:id/results.xlsx", async (req, res) => {
  try {
    const { rows: tests } = await pool.query("SELECT title,total_points FROM tests WHERE id=$1", [req.params.id]);
    if (!tests[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    const { rows } = await pool.query(
      `SELECT s.name AS student_name, c.name AS class_name, tr.status, tr.score, t.total_points, tr.submitted_at
       FROM test_results tr JOIN students s ON s.id=tr.student_id JOIN tests t ON t.id=tr.test_id
       LEFT JOIN classes c ON c.id=s.class_id WHERE tr.test_id=$1 ORDER BY s.name`,
      [req.params.id]
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("النتائج");
    sheet.columns = [
      { header: "اسم الطالبة", key: "student_name" }, { header: "الفصل", key: "class_name" }, { header: "الحالة", key: "status" },
      { header: "الدرجة", key: "score" }, { header: "الدرجة الكلية", key: "total_points" }, { header: "النسبة", key: "percent" }, { header: "تاريخ التسليم", key: "submitted_at" },
    ];
    rows.forEach((r) => sheet.addRow({ ...r, percent: r.total_points ? Math.round((Number(r.score || 0) / r.total_points) * 100) + "%" : "0%" }));
    styleWorksheet(sheet);
    await sendWorkbook(res, workbook, `${tests[0].title}-النتائج.xlsx`);
  } catch (err) {
    console.error("export results error", err);
    res.status(500).json({ error: "تعذّر تصدير النتائج." });
  }
});

router.get("/:id/analysis.xlsx", async (req, res) => {
  try {
    const { rows: tests } = await pool.query("SELECT title FROM tests WHERE id=$1", [req.params.id]);
    if (!tests[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    const { rows } = await pool.query(
      `SELECT q.order_index, q.question_text, q.points,
              COUNT(a.id)::int AS answer_count,
              COUNT(a.id) FILTER (WHERE a.is_correct=true)::int AS correct_count,
              COALESCE(ROUND(AVG(a.points_earned)::numeric,2),0) AS average_points
       FROM questions q LEFT JOIN answers a ON a.question_id=q.id
       WHERE q.test_id=$1 GROUP BY q.id ORDER BY q.order_index`,
      [req.params.id]
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("تحليل الاختبار");
    sheet.columns = [
      { header: "م", key: "order_index" }, { header: "السؤال", key: "question_text" }, { header: "درجة السؤال", key: "points" },
      { header: "عدد الإجابات", key: "answer_count" }, { header: "الإجابات الصحيحة", key: "correct_count" },
      { header: "نسبة الصحة", key: "correct_percent" }, { header: "متوسط الدرجة", key: "average_points" },
    ];
    rows.forEach((r) => sheet.addRow({ ...r, correct_percent: r.answer_count ? Math.round((r.correct_count / r.answer_count) * 100) + "%" : "0%" }));
    styleWorksheet(sheet);
    await sendWorkbook(res, workbook, `${tests[0].title}-تحليل-الاختبار.xlsx`);
  } catch (err) {
    console.error("export analysis error", err);
    res.status(500).json({ error: "تعذّر تصدير تحليل الاختبار." });
  }
});

module.exports = router;
