// Auth helpers for the teacher dashboard + owner dashboard: password hashing + session middleware.
const bcrypt = require("bcryptjs");
const pool = require("./db");

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Blocks any /api/teacher/* route (other than login/register) if there is no session,
// and immediately kicks out a teacher whose account was disabled by the owner mid-session.
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.teacherId) {
    return res.status(401).json({ error: "غير مصرح لكِ بالدخول. يرجى تسجيل الدخول." });
  }
  try {
    const { rows } = await pool.query("SELECT disabled FROM teachers WHERE id = $1", [req.session.teacherId]);
    if (!rows[0] || rows[0].disabled) {
      req.session.destroy(() => {});
      return res.status(403).json({ error: "تم تعطيل هذا الحساب. يرجى التواصل مع مالكة الموقع." });
    }
    return next();
  } catch (err) {
    console.error("requireAuth check error", err);
    return res.status(500).json({ error: "حدث خطأ في الخادم." });
  }
}

// Blocks any /api/owner/* route (other than login) if there is no owner session.
// Owner sessions use a completely separate session key (ownerId) from teacher sessions (teacherId),
// so a teacher session can never grant owner access and vice versa.
function requireOwnerAuth(req, res, next) {
  if (req.session && req.session.ownerId) {
    return next();
  }
  return res.status(401).json({ error: "غير مصرح لكِ بالدخول. يرجى تسجيل الدخول." });
}

module.exports = { hashPassword, verifyPassword, requireAuth, requireOwnerAuth };
