const express = require("express");
const pool = require("../db");

const router = express.Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_preferences (
      teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
      question_bank JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/question-bank", async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      "SELECT question_bank FROM teacher_preferences WHERE teacher_id = $1",
      [req.session.teacherId]
    );
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
       ON CONFLICT (teacher_id)
       DO UPDATE SET question_bank = EXCLUDED.question_bank, updated_at = NOW()
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
    await pool.query("DELETE FROM teacher_preferences WHERE teacher_id = $1", [req.session.teacherId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("reset question bank preferences error", err);
    res.status(500).json({ error: "تعذّر إعادة ضبط إعدادات بنك الأسئلة." });
  }
});

module.exports = router;
