// Creates the FIRST owner account from Replit Secrets (OWNER_EMAIL / OWNER_INITIAL_PASSWORD)
// the very first time the server starts and no owner exists yet. It never runs again after
// that (idempotent — checks "does any owner row exist" not "does this email exist"), so it
// will not silently overwrite a password the owner has since changed. The credentials are
// never written into any HTML/JS file — they only ever live in Replit Secrets + the hashed
// column in the database.
const pool = require("./db");
const { hashPassword } = require("./auth");

async function bootstrapOwner() {
  const { rows: existing } = await pool.query("SELECT COUNT(*)::int AS n FROM owners");
  if (existing[0].n > 0) return; // an owner already exists — never auto-create another one

  const email = process.env.OWNER_EMAIL;
  const initialPassword = process.env.OWNER_INITIAL_PASSWORD;

  if (!email || !initialPassword) {
    console.warn(
      "[owner-bootstrap] لم يتم إنشاء حساب المالكة: OWNER_EMAIL و OWNER_INITIAL_PASSWORD غير موجودين في Secrets."
    );
    return;
  }

  const passwordHash = await hashPassword(initialPassword);
  await pool.query(
    "INSERT INTO owners (name, email, password_hash) VALUES ($1,$2,$3)",
    ["مالكة الموقع", email.trim().toLowerCase(), passwordHash]
  );
  console.log(`[owner-bootstrap] تم إنشاء حساب المالكة الأول (${email.trim().toLowerCase()}).`);
}

module.exports = bootstrapOwner;
