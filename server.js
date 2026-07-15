// Static site server for "مدار" + backend API and dashboard for the teacher ("لوحة المعلمة").
const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const pool = require("./backend/db");
const { requireAuth, requireOwnerAuth } = require("./backend/auth");
const bootstrapOwner = require("./backend/bootstrapOwner");

const authRoutes = require("./backend/routes/auth");
const dashboardRoutes = require("./backend/routes/dashboard");
const studentsRoutes = require("./backend/routes/students");
const testsRoutes = require("./backend/routes/tests");
const analysisRoutes = require("./backend/routes/analysis");
const miscRoutes = require("./backend/routes/misc");
const reportsRoutes = require("./backend/routes/reports");
const ownerAuthRoutes = require("./backend/routes/ownerAuth");
const ownerRoutes = require("./backend/routes/owner");

const app = express();
const PORT = 5000;

app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    store: new pgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "madar-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// --- Teacher dashboard API (all protected except /login) ---
app.use("/api/teacher", authRoutes);
app.use("/api/teacher/dashboard", requireAuth, dashboardRoutes);
app.use("/api/teacher/students", requireAuth, studentsRoutes);
app.use("/api/teacher/tests", requireAuth, testsRoutes);
app.use("/api/teacher/analysis", requireAuth, analysisRoutes);
app.use("/api/teacher/data", requireAuth, miscRoutes);
app.use("/api/teacher/reports", requireAuth, reportsRoutes);

// --- Owner ("مالكة الموقع") API — completely separate role/session from teachers/students.
// No public registration route exists anywhere for this role; the only account is created
// once by bootstrapOwner() from Replit Secrets. Every route below (other than /login) is
// enforced server-side via requireOwnerAuth, not just hidden in the UI.
app.use("/api/owner", ownerAuthRoutes);
app.use("/api/owner", requireOwnerAuth, ownerRoutes);

// --- Static site (existing pages) + teacher dashboard frontend ---
app.use("/teacher", express.static(path.join(__dirname, "teacher")));
app.use(express.static(__dirname));

app.get("/teacher", (req, res) => {
  res.sendFile(path.join(__dirname, "teacher", "login.html"));
});

// Owner dashboard pages are server-guarded: /owner/dashboard requires a valid owner
// session, and teachers/students (or anyone unauthenticated) are redirected to the
// owner login page instead of ever reaching the protected HTML. Only the "public"
// subfolder (login page + shared assets, no sensitive markup) is statically served;
// the actual dashboard HTML lives in "protected" and is only ever sent by the
// session-checked route handler below — never reachable via a direct static request.
app.use("/owner", express.static(path.join(__dirname, "owner", "public")));

app.get("/owner", (req, res) => {
  res.redirect("/owner/login.html");
});

app.get("/owner/dashboard", (req, res) => {
  if (!req.session || !req.session.ownerId) {
    return res.redirect("/owner/login.html");
  }
  res.sendFile(path.join(__dirname, "owner", "protected", "dashboard.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => {
  res.status(404).send("<h1>404 - الصفحة غير موجودة</h1>");
});

bootstrapOwner()
  .catch((err) => console.error("[owner-bootstrap] error:", err))
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://0.0.0.0:${PORT}/`);
    });
  });
