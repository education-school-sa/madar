const express = require("express");
const pool = require("../db");
const { verifyPassword, hashPassword, requireAuth } = require("../auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "يرجى إدخال البريد الإلكتروني وكلمة المرور." });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash FROM teachers WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const teacher = rows[0];
    if (!teacher) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    const ok = await verifyPassword(password, teacher.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    req.session.teacherId = teacher.id;
    await pool.query(
      "INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)",
      [teacher.id, "تسجيل الدخول", "تسجيل دخول ناجح إلى لوحة المعلمة"]
    );
    res.json({ id: teacher.id, name: teacher.name, email: teacher.email });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاولي مرة أخرى." });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword, agreeTerms } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "يرجى إدخال اسم المعلمة." });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: "يرجى إدخال البريد الإلكتروني." });
  }
  if (!password || !confirmPassword) {
    return res.status(400).json({ error: "يرجى إدخال كلمة المرور وتأكيدها." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "يجب أن تكون كلمة المرور 8 أحرف على الأقل." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "كلمة المرور وتأكيدها غير متطابقين." });
  }
  if (!agreeTerms) {
    return res.status(400).json({ error: "يجب الموافقة على الشروط والأحكام لإنشاء الحساب." });
  }
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      "INSERT INTO teachers (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email",
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );
    const teacher = rows[0];
    req.session.teacherId = teacher.id;
    await pool.query(
      "INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)",
      [teacher.id, "إنشاء حساب", "تم إنشاء حساب معلمة جديد وتسجيل الدخول تلقائيًا"]
    );
    res.status(201).json(teacher);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "هذا البريد الإلكتروني مسجّل بالفعل، يرجى تسجيل الدخول." });
    }
    console.error("register error", err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاولي مرة أخرى." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session || !req.session.teacherId) {
    return res.status(401).json({ error: "غير مسجّلة الدخول." });
  }
  const { rows } = await pool.query(
    "SELECT id, name, email, avatar_url FROM teachers WHERE id = $1",
    [req.session.teacherId]
  );
  if (!rows[0]) return res.status(401).json({ error: "غير مسجّلة الدخول." });
  res.json(rows[0]);
});

// Update profile (name/email) and optionally change password.
router.put("/me", requireAuth, async (req, res) => {
  const { name, email, currentPassword, newPassword, confirmPassword } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT * FROM teachers WHERE id = $1", [req.session.teacherId]);
    const teacher = rows[0];
    if (!teacher) return res.status(404).json({ error: "المعلمة غير موجودة." });

    let passwordHash = teacher.password_hash;
    if (newPassword || currentPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: "يرجى تعبئة جميع حقول كلمة المرور." });
      }
      const ok = await verifyPassword(currentPassword, teacher.password_hash);
      if (!ok) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة." });
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "كلمة المرور الجديدة وتأكيدها غير متطابقين." });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "يجب أن تكون كلمة المرور الجديدة 8 أحرف على الأقل." });
      }
      passwordHash = await hashPassword(newPassword);
    }

    const finalName = name && name.trim() ? name.trim() : teacher.name;
    const finalEmail = email && email.trim() ? email.trim().toLowerCase() : teacher.email;

    const updated = await pool.query(
      "UPDATE teachers SET name = $1, email = $2, password_hash = $3 WHERE id = $4 RETURNING id, name, email",
      [finalName, finalEmail, passwordHash, teacher.id]
    );
    await pool.query(
      "INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)",
      [teacher.id, "تحديث الملف الشخصي", newPassword ? "تم تغيير كلمة المرور" : "تم تحديث البيانات الشخصية"]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "هذا البريد الإلكتروني مستخدم من قبل معلمة أخرى." });
    }
    console.error("update profile error", err);
    res.status(500).json({ error: "حدث خطأ في الخادم." });
  }
});

module.exports = router;
