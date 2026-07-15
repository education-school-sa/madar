// Owner-only management API: teacher/student accounts, activity log, settings,
// and oversight of tests/results across all teachers. Every route here is
// mounted behind requireOwnerAuth in server.js — never trust the frontend alone.
const express = require("express");
const pool = require("../db");
const { hashPassword } = require("../auth");

const router = express.Router();

function logOwnerAction(ownerId, action, details) {
  pool
    .query("INSERT INTO activity_log (owner_id, actor_role, action, details) VALUES ($1,'owner',$2,$3)", [
      ownerId,
      action,
      details,
    ])
    .catch((e) => console.error("owner activity log error", e));
}

// -------- لوحة المالكة: نظرة عامة --------
router.get("/summary", async (req, res) => {
  const [teachers, students, tests, results] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE disabled)::int AS disabled_n FROM teachers"),
    pool.query("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE disabled)::int AS disabled_n FROM students"),
    pool.query("SELECT COUNT(*)::int AS n FROM tests"),
    pool.query("SELECT COUNT(*)::int AS n FROM test_results"),
  ]);
  res.json({
    teachers: teachers.rows[0].n,
    teachersDisabled: teachers.rows[0].disabled_n,
    students: students.rows[0].n,
    studentsDisabled: students.rows[0].disabled_n,
    tests: tests.rows[0].n,
    results: results.rows[0].n,
  });
});

// -------- إدارة حسابات المعلمات --------
router.get("/teachers", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, disabled, created_at FROM teachers ORDER BY created_at DESC"
  );
  res.json(rows);
});

router.post("/teachers", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !name.trim() || !email || !email.trim() || !password) {
    return res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "يجب أن تكون كلمة المرور 8 أحرف على الأقل." });
  }
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      "INSERT INTO teachers (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email, disabled, created_at",
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );
    logOwnerAction(req.session.ownerId, "إنشاء حساب معلمة", `تم إنشاء حساب المعلمة: ${rows[0].email}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "هذا البريد الإلكتروني مسجّل بالفعل." });
    console.error("owner create teacher error", err);
    res.status(500).json({ error: "حدث خطأ في الخادم." });
  }
});

router.put("/teachers/:id/status", async (req, res) => {
  const { disabled } = req.body || {};
  const { rows } = await pool.query(
    "UPDATE teachers SET disabled = $1 WHERE id = $2 RETURNING id, name, email, disabled",
    [!!disabled, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "المعلمة غير موجودة." });
  logOwnerAction(
    req.session.ownerId,
    disabled ? "تعطيل حساب معلمة" : "تفعيل حساب معلمة",
    `${rows[0].email}`
  );
  res.json(rows[0]);
});

router.put("/teachers/:id/reset-password", async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "يجب أن تكون كلمة المرور الجديدة 8 أحرف على الأقل." });
  }
  const passwordHash = await hashPassword(newPassword);
  const { rows } = await pool.query(
    "UPDATE teachers SET password_hash = $1 WHERE id = $2 RETURNING id, email",
    [passwordHash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "المعلمة غير موجودة." });
  logOwnerAction(req.session.ownerId, "إعادة تعيين كلمة مرور معلمة", `${rows[0].email}`);
  res.json({ ok: true });
});

router.delete("/teachers/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM teachers WHERE id = $1 RETURNING id, email", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "المعلمة غير موجودة." });
  logOwnerAction(req.session.ownerId, "حذف حساب معلمة", `${rows[0].email}`);
  res.json({ ok: true });
});

// -------- إدارة حسابات الطالبات --------
// ملاحظة: حسابات تسجيل الدخول الفعلية للطالبات لم تُبنَ بعد (مهمة منفصلة)،
// لذا الإدارة هنا تشمل التفعيل/التعطيل/الحذف لسجل الطالبة فقط.
router.get("/students", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.email, s.disabled, s.level, s.created_at, c.name AS class_name
     FROM students s LEFT JOIN classes c ON c.id = s.class_id
     ORDER BY s.created_at DESC`
  );
  res.json(rows);
});

router.put("/students/:id/status", async (req, res) => {
  const { disabled } = req.body || {};
  const { rows } = await pool.query(
    "UPDATE students SET disabled = $1 WHERE id = $2 RETURNING id, name, email, disabled",
    [!!disabled, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "الطالبة غير موجودة." });
  logOwnerAction(req.session.ownerId, disabled ? "تعطيل حساب طالبة" : "تفعيل حساب طالبة", `${rows[0].email}`);
  res.json(rows[0]);
});

router.delete("/students/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM students WHERE id = $1 RETURNING id, email", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "الطالبة غير موجودة." });
  logOwnerAction(req.session.ownerId, "حذف حساب طالبة", `${rows[0].email}`);
  res.json({ ok: true });
});

// -------- الاختبارات والنتائج (نظرة إشرافية على جميع المعلمات) --------
router.get("/tests", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.category, t.status, t.created_at, te.name AS teacher_name,
            COUNT(r.id)::int AS results_count
     FROM tests t
     JOIN teachers te ON te.id = t.teacher_id
     LEFT JOIN test_results r ON r.test_id = t.id
     GROUP BY t.id, te.name
     ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

router.delete("/tests/:id", async (req, res) => {
  const { rows } = await pool.query("DELETE FROM tests WHERE id = $1 RETURNING id, title", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
  logOwnerAction(req.session.ownerId, "حذف اختبار", `${rows[0].title}`);
  res.json({ ok: true });
});

// -------- الإعدادات العامة --------
router.get("/settings", async (req, res) => {
  const { rows } = await pool.query("SELECT key, value FROM app_settings");
  const settings = {};
  rows.forEach((r) => (settings[r.key] = r.value));
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: "المفتاح مطلوب." });
  await pool.query(
    "INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [key, String(value)]
  );
  logOwnerAction(req.session.ownerId, "تحديث إعداد", `${key} = ${value}`);
  res.json({ ok: true });
});

// -------- سجل الأنشطة الكامل (كل المعلمات + المالكة) --------
router.get("/activity-log", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.details, a.actor_role, a.created_at,
            t.name AS teacher_name, o.name AS owner_name
     FROM activity_log a
     LEFT JOIN teachers t ON t.id = a.teacher_id
     LEFT JOIN owners o ON o.id = a.owner_id
     ORDER BY a.created_at DESC
     LIMIT 300`
  );
  res.json(rows);
});

module.exports = router;
