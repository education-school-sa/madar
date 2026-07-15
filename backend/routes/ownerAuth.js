// Auth endpoints for the site-owner role. There is intentionally NO public
// registration endpoint here — the only owner account is created once by
// bootstrapOwner() from Replit Secrets (OWNER_EMAIL / OWNER_INITIAL_PASSWORD).
const express = require("express");
const pool = require("../db");
const { verifyPassword, requireOwnerAuth } = require("../auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "يرجى إدخال البريد الإلكتروني وكلمة المرور." });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, password_hash FROM owners WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    const owner = rows[0];
    if (!owner) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    const ok = await verifyPassword(password, owner.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    // Regenerate the session on privilege escalation to avoid session fixation,
    // and never share a session that might already carry a teacherId.
    req.session.regenerate((err) => {
      if (err) {
        console.error("owner session regenerate error", err);
        return res.status(500).json({ error: "حدث خطأ في الخادم." });
      }
      req.session.ownerId = owner.id;
      pool
        .query(
          "INSERT INTO activity_log (owner_id, actor_role, action, details) VALUES ($1,'owner',$2,$3)",
          [owner.id, "تسجيل الدخول", "تسجيل دخول ناجح إلى لوحة المالكة"]
        )
        .catch((e) => console.error("owner login log error", e));
      res.json({ id: owner.id, name: owner.name, email: owner.email });
    });
  } catch (err) {
    console.error("owner login error", err);
    res.status(500).json({ error: "حدث خطأ في الخادم، حاول مرة أخرى." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", requireOwnerAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT id, name, email FROM owners WHERE id = $1", [req.session.ownerId]);
  if (!rows[0]) return res.status(401).json({ error: "غير مسجّل الدخول." });
  res.json(rows[0]);
});

module.exports = router;
