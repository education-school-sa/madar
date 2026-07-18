const express = require("express");
const pool = require("../db");

const router = express.Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_preferences (
      teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
      question_bank JSONB NOT NULL DEFAULT '{}'::jsonb,
      report_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE teacher_preferences ADD COLUMN IF NOT EXISTS report_settings JSONB NOT NULL DEFAULT '{}'::jsonb`);
}

router.get("/question-bank", async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query("SELECT question_bank FROM teacher_preferences WHERE teacher_id = $1", [req.session.teacherId]);
    res.json(rows[0]?.question_bank || {});
  } catch (err) {
    console.error("load question bank preferences error", err);
    res.status(500).json({ error: "تعذّر تحميل إعدادات بنك الأسئلة." });
  }
});

router.put("/question-bank", async (req, res) => {
  try {
    await ensureTable();
    const settings = req.body && typeof req.body === "object" ? req.body : {};
    const { rows } = await pool.query(
      `INSERT INTO teacher_preferences (teacher_id, question_bank, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (teacher_id) DO UPDATE SET question_bank = EXCLUDED.question_bank, updated_at = NOW()
       RETURNING question_bank`,
      [req.session.teacherId, JSON.stringify(settings)]
    );
    res.json(rows[0].question_bank);
  } catch (err) {
    console.error("save question bank preferences error", err);
    res.status(500).json({ error: "تعذّر حفظ إعدادات بنك الأسئلة." });
  }
});

router.delete("/question-bank", async (req, res) => {
  try {
    await ensureTable();
    await pool.query("UPDATE teacher_preferences SET question_bank = '{}'::jsonb, updated_at = NOW() WHERE teacher_id = $1", [req.session.teacherId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("reset question bank preferences error", err);
    res.status(500).json({ error: "تعذّر إعادة ضبط إعدادات بنك الأسئلة." });
  }
});

function normalizedSchoolSettings(body, fallbackTeacherName = "") {
  const logoData = String(body.logoData || "");
  return {
    schoolName: String(body.schoolName || "").trim(),
    educationDepartment: String(body.educationDepartment || "").trim(),
    educationOffice: String(body.educationOffice || "").trim(),
    teacherName: String(body.teacherName || fallbackTeacherName || "").trim(),
    principalName: String(body.principalName || "").trim(),
    academicYear: String(body.academicYear || "").trim(),
    semester: ["الأول", "الثاني"].includes(body.semester) ? body.semester : "الأول",
    logoType: ["ksa", "ministry", "custom"].includes(body.logoType) ? body.logoType : "ksa",
    logoData: logoData.startsWith("data:image/") && logoData.length <= 1500000 ? logoData : "",
  };
}

router.get("/reports", async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT t.name, p.report_settings FROM teachers t
       LEFT JOIN teacher_preferences p ON p.teacher_id = t.id WHERE t.id = $1`,
      [req.session.teacherId]
    );
    const saved = normalizedSchoolSettings(rows[0]?.report_settings || {}, rows[0]?.name || "");
    res.json({ ...saved, complete: Boolean(saved.schoolName && saved.educationDepartment && saved.teacherName && saved.academicYear) });
  } catch (err) {
    console.error("load report settings error", err);
    res.status(500).json({ error: "تعذّر تحميل بيانات المدرسة." });
  }
});

router.put("/reports", async (req, res) => {
  try {
    await ensureTable();
    const { rows: teacherRows } = await pool.query("SELECT name FROM teachers WHERE id=$1", [req.session.teacherId]);
    const settings = normalizedSchoolSettings(req.body || {}, teacherRows[0]?.name || "");
    if (!settings.schoolName || !settings.educationDepartment || !settings.teacherName || !settings.academicYear) {
      return res.status(400).json({ error: "اسم المدرسة وإدارة التعليم واسم المعلمة والعام الدراسي حقول مطلوبة." });
    }
    const { rows } = await pool.query(
      `INSERT INTO teacher_preferences (teacher_id, report_settings, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (teacher_id) DO UPDATE SET report_settings = EXCLUDED.report_settings, updated_at = NOW()
       RETURNING report_settings`,
      [req.session.teacherId, JSON.stringify(settings)]
    );
    res.json({ ...rows[0].report_settings, complete: true });
  } catch (err) {
    console.error("save report settings error", err);
    res.status(500).json({ error: "تعذّر حفظ بيانات المدرسة." });
  }
});

module.exports = router;
