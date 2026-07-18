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
const testFilesRoutes = require("./backend/routes/testFiles");
const analysisRoutes = require("./backend/routes/analysis");
const miscRoutes = require("./backend/routes/misc");
const reportsRoutes = require("./backend/routes/reports");
const preferencesRoutes = require("./backend/routes/preferences");
const ownerAuthRoutes = require("./backend/routes/ownerAuth");
const ownerRoutes = require("./backend/routes/owner");

const app = express();
const PORT = 5000;

app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));

app.use(
  session({
    store: new pgSession({ pool, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "madar-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use("/api/teacher", authRoutes);
app.use("/api/teacher/dashboard", requireAuth, dashboardRoutes);
app.use("/api/teacher/students", requireAuth, studentsRoutes);
app.use("/api/teacher/tests", requireAuth, testsRoutes);
app.use("/api/teacher/test-files", requireAuth, testFilesRoutes);
app.use("/api/teacher/analysis", requireAuth, analysisRoutes);
app.use("/api/teacher/data", requireAuth, miscRoutes);
app.use("/api/teacher/reports", requireAuth, reportsRoutes);
app.use("/api/teacher/preferences", requireAuth, preferencesRoutes);

app.use("/api/owner", ownerAuthRoutes);
app.use("/api/owner", requireOwnerAuth, ownerRoutes);

app.use("/teacher", express.static(path.join(__dirname, "teacher")));
app.use(express.static(__dirname));

app.get("/teacher", (req, res) => {
  res.sendFile(path.join(__dirname, "teacher", "login.html"));
});

app.use("/owner", express.static(path.join(__dirname, "owner", "public")));
app.get("/owner", (req, res) => res.redirect("/owner/login.html"));
app.get("/owner/dashboard", (req, res) => {
  if (!req.session || !req.session.ownerId) return res.redirect("/owner/login.html");
  res.sendFile(path.join(__dirname, "owner", "protected", "dashboard.html"));
});

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.use((req, res) => res.status(404).send("<h1>404 - الصفحة غير موجودة</h1>"));

bootstrapOwner()
  .catch((err) => console.error("[owner-bootstrap] error:", err))
  .finally(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${PORT}/`));
  });
