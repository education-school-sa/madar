// Auth helpers for the teacher dashboard: password hashing + session middleware.
const bcrypt = require("bcryptjs");

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Blocks any /api/teacher/* route (other than login) if there is no session.
function requireAuth(req, res, next) {
  if (req.session && req.session.teacherId) {
    return next();
  }
  return res.status(401).json({ error: "غير مصرح لكِ بالدخول. يرجى تسجيل الدخول." });
}

module.exports = { hashPassword, verifyPassword, requireAuth };
