const express = require("express");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const pool = require("../db");

const router = express.Router();

// تصدير قائمة الطالبات إلى Excel
router.get("/students.xlsx", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.name, s.email, c.name AS class_name, s.level, s.progress_percent, s.last_active
       FROM students s LEFT JOIN classes c ON c.id = s.class_id ORDER BY s.name`
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("الطالبات");
    sheet.views = [{ rightToLeft: true }];
    sheet.columns = [
      { header: "الاسم", key: "name", width: 25 },
      { header: "البريد الإلكتروني", key: "email", width: 28 },
      { header: "الفصل", key: "class_name", width: 20 },
      { header: "المستوى", key: "level", width: 15 },
      { header: "نسبة التقدم", key: "progress_percent", width: 15 },
      { header: "آخر نشاط", key: "last_active", width: 20 },
    ];
    rows.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).font = { bold: true };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=students-report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("export students xlsx error", err);
    res.status(500).json({ error: "تعذّر تصدير التقرير." });
  }
});

// تقرير متابعة طالبة واحدة PDF (نص إنجليزي/أرقام لتفادي مشاكل الخطوط العربية في pdfkit الأساسي)
router.get("/student/:id.pdf", async (req, res) => {
  try {
    const { rows: studentRows } = await pool.query(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = $1`,
      [req.params.id]
    );
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: "الطالبة غير موجودة." });

    const { rows: results } = await pool.query(
      `SELECT t.title, tr.score, t.total_points, tr.status FROM test_results tr
       JOIN tests t ON t.id = tr.test_id WHERE tr.student_id = $1`,
      [req.params.id]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=student-${req.params.id}-report.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text(`Madar - Student Progress Report`, { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Name: ${student.name}`);
    doc.text(`Email: ${student.email}`);
    doc.text(`Class: ${student.class_name || "-"}`);
    doc.text(`Level: ${student.level}`);
    doc.text(`Progress: ${student.progress_percent}%`);
    doc.moveDown();
    doc.fontSize(14).text("Test Results:");
    results.forEach((r) => {
      doc.fontSize(11).text(`- ${r.title}: ${r.score}/${r.total_points} (${r.status})`);
    });
    doc.end();
  } catch (err) {
    console.error("export student pdf error", err);
    res.status(500).json({ error: "تعذّر تصدير التقرير." });
  }
});

// تقرير الفصل العام PDF
router.get("/class.pdf", async (req, res) => {
  try {
    const { classId } = req.query;
    const params = [];
    let whereSql = "";
    if (classId) {
      params.push(Number(classId));
      whereSql = "WHERE s.class_id = $1";
    }
    const { rows: students } = await pool.query(
      `SELECT s.name, s.progress_percent FROM students s ${whereSql} ORDER BY s.progress_percent DESC`,
      params
    );
    const average = students.length
      ? Math.round(students.reduce((a, b) => a + b.progress_percent, 0) / students.length)
      : 0;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=class-report.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text("Madar - Class Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Average progress: ${average}%`);
    doc.text(`Number of students: ${students.length}`);
    doc.moveDown();
    students.forEach((s) => doc.fontSize(11).text(`- ${s.name}: ${s.progress_percent}%`));
    doc.end();
  } catch (err) {
    console.error("export class pdf error", err);
    res.status(500).json({ error: "تعذّر تصدير التقرير." });
  }
});

module.exports = router;
