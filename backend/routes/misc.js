const express = require("express");
const pool = require("../db");

const router = express.Router();

// الفصول والمجموعات
router.get("/classes", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.level, COUNT(s.id)::int AS student_count
     FROM classes c LEFT JOIN students s ON s.class_id = c.id
     GROUP BY c.id ORDER BY c.id`
  );
  res.json(rows);
});

router.post("/classes", async (req, res) => {
  const { name, level } = req.body || {};
  if (!name || !level) return res.status(400).json({ error: "اسم الفصل والمستوى مطلوبان." });
  const { rows } = await pool.query("INSERT INTO classes (name, level) VALUES ($1,$2) RETURNING *", [name.trim(), level]);
  res.status(201).json(rows[0]);
});

router.put("/classes/:id", async (req, res) => {
  const { name, level } = req.body || {};
  const { rows } = await pool.query(
    "UPDATE classes SET name = COALESCE($1,name), level = COALESCE($2,level) WHERE id = $3 RETURNING *",
    [name, level, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "الفصل غير موجود." });
  res.json(rows[0]);
});

router.delete("/classes/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM classes WHERE id = $1 RETURNING id", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "الفصل غير موجود." });
  res.json({ ok: true });
});

// المهارات (لاستخدامها في إنشاء الاختبارات وتحليل النتائج)
router.get("/skills", async (req, res) => {
  const { rows } = await pool.query("SELECT id, name, subject FROM skills ORDER BY name");
  res.json(rows);
});

// الإشعارات
router.get("/notifications", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM notifications WHERE teacher_id = $1 ORDER BY created_at DESC",
    [req.session.teacherId]
  );
  res.json(rows);
});

router.put("/notifications/:id/read", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE notifications SET is_read = true WHERE id = $1 AND teacher_id = $2 RETURNING *",
    [req.params.id, req.session.teacherId]
  );
  if (!rows[0]) return res.status(404).json({ error: "الإشعار غير موجود." });
  res.json(rows[0]);
});

router.delete("/notifications/:id", async (req, res) => {
  await pool.query("DELETE FROM notifications WHERE id = $1 AND teacher_id = $2", [req.params.id, req.session.teacherId]);
  res.json({ ok: true });
});

// سجل الأنشطة
router.get("/activity-log", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM activity_log WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 100",
    [req.session.teacherId]
  );
  res.json(rows);
});

module.exports = router;
