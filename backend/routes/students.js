const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const pool = require("../db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/teacher/students?search=&classId=&level=&page=&pageSize=
router.get("/", async (req, res) => {
  try {
    const { search = "", classId = "", level = "", page = "1", pageSize = "10" } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;

    if (search) {
      conditions.push(`(s.name ILIKE $${i} OR s.email ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    if (classId) {
      conditions.push(`s.class_id = $${i}`);
      params.push(Number(classId));
      i++;
    }
    if (level) {
      conditions.push(`s.level = $${i}`);
      params.push(level);
      i++;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM students s ${whereSql}`,
      params
    );
    const total = countResult.rows[0].count;

    const limit = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limit;

    const dataResult = await pool.query(
      `SELECT s.id, s.name, s.email, s.level, s.progress_percent, s.last_active, c.name AS class_name, c.id AS class_id
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       ${whereSql}
       ORDER BY s.name
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );

    res.json({ items: dataResult.rows, total, page: pageNum, pageSize: limit });
  } catch (err) {
    console.error("list students error", err);
    res.status(500).json({ error: "تعذّر تحميل قائمة الطالبات." });
  }
});

router.get("/classes", async (req, res) => {
  const { rows } = await pool.query("SELECT id, name, level FROM classes ORDER BY id");
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name, email, classId, level } = req.body || {};
  if (!name || !email || !level) {
    return res.status(400).json({ error: "الاسم والبريد الإلكتروني والمستوى مطلوبة." });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO students (name, email, class_id, level) VALUES ($1,$2,$3,$4) RETURNING *",
      [name.trim(), email.trim().toLowerCase(), classId || null, level]
    );
    await pool.query("INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)", [
      req.session.teacherId,
      "إضافة طالبة",
      `تمت إضافة الطالبة ${name}`,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "هذا البريد الإلكتروني مستخدم من قبل طالبة أخرى." });
    }
    console.error("create student error", err);
    res.status(500).json({ error: "تعذّر إضافة الطالبة." });
  }
});

router.put("/:id", async (req, res) => {
  const { name, email, classId, level, progressPercent } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE students SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        class_id = $3,
        level = COALESCE($4, level),
        progress_percent = COALESCE($5, progress_percent)
       WHERE id = $6 RETURNING *`,
      [name, email, classId ?? null, level, progressPercent, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "الطالبة غير موجودة." });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "هذا البريد الإلكتروني مستخدم من قبل طالبة أخرى." });
    }
    console.error("update student error", err);
    res.status(500).json({ error: "تعذّر تعديل بيانات الطالبة." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("DELETE FROM students WHERE id = $1 RETURNING id, name", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "الطالبة غير موجودة." });
    await pool.query("INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)", [
      req.session.teacherId,
      "حذف طالبة",
      `تم حذف الطالبة ${rows[0].name}`,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete student error", err);
    res.status(500).json({ error: "تعذّر حذف الطالبة." });
  }
});

// CSV import: columns name,email,level,class_name (class optional)
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "يرجى اختيار ملف CSV." });
  try {
    const records = parse(req.file.buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    let created = 0;
    const errors = [];
    for (const [idx, row] of records.entries()) {
      const name = row.name || row["الاسم"];
      const email = (row.email || row["البريد الإلكتروني"] || "").toLowerCase();
      const level = row.level || row["المستوى"] || "متوسط";
      const className = row.class_name || row["الفصل"];
      if (!name || !email) {
        errors.push(`سطر ${idx + 2}: الاسم أو البريد ناقص.`);
        continue;
      }
      let classId = null;
      if (className) {
        const cls = await pool.query("SELECT id FROM classes WHERE name = $1", [className]);
        classId = cls.rows[0]?.id || null;
      }
      try {
        await pool.query(
          "INSERT INTO students (name, email, class_id, level) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING",
          [name, email, classId, level]
        );
        created++;
      } catch (e) {
        errors.push(`سطر ${idx + 2}: ${e.message}`);
      }
    }
    await pool.query("INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)", [
      req.session.teacherId,
      "استيراد طالبات",
      `تم استيراد ${created} طالبة من ملف CSV`,
    ]);
    res.json({ created, errors });
  } catch (err) {
    console.error("csv import error", err);
    res.status(500).json({ error: "تعذّرت قراءة ملف CSV. تحققي من تنسيقه." });
  }
});

// Full follow-up profile for one student: grades, skills, notes, attendance, assignments, progress
router.get("/:id/profile", async (req, res) => {
  try {
    const studentId = req.params.id;
    const { rows: studentRows } = await pool.query(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = $1`,
      [studentId]
    );
    if (!studentRows[0]) return res.status(404).json({ error: "الطالبة غير موجودة." });

    const [{ rows: results }, { rows: skills }, { rows: notes }, { rows: attendance }, { rows: assignments }] =
      await Promise.all([
        pool.query(
          `SELECT tr.id, t.title, t.type, tr.status, tr.score, t.total_points, tr.submitted_at
           FROM test_results tr JOIN tests t ON t.id = tr.test_id
           WHERE tr.student_id = $1 ORDER BY tr.created_at DESC`,
          [studentId]
        ),
        pool.query(
          `SELECT sk.name, ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id = ss.skill_id
           WHERE ss.student_id = $1 ORDER BY ss.mastery_percent DESC`,
          [studentId]
        ),
        pool.query(
          `SELECT n.id, n.content, n.created_at, t.name AS teacher_name FROM notes n
           JOIN teachers t ON t.id = n.teacher_id WHERE n.student_id = $1 ORDER BY n.created_at DESC`,
          [studentId]
        ),
        pool.query(`SELECT date, status FROM attendance WHERE student_id = $1 ORDER BY date DESC LIMIT 30`, [studentId]),
        pool.query(`SELECT id, title, status, due_date FROM assignments WHERE student_id = $1 ORDER BY due_date DESC`, [studentId]),
      ]);

    res.json({ student: studentRows[0], results, skills, notes, attendance, assignments });
  } catch (err) {
    console.error("student profile error", err);
    res.status(500).json({ error: "تعذّر تحميل ملف الطالبة." });
  }
});

router.post("/:id/notes", async (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "لا يمكن إضافة ملاحظة فارغة." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO notes (student_id, teacher_id, content) VALUES ($1,$2,$3) RETURNING *",
      [req.params.id, req.session.teacherId, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("add note error", err);
    res.status(500).json({ error: "تعذّر إضافة الملاحظة." });
  }
});

router.put("/notes/:noteId", async (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "لا يمكن ترك الملاحظة فارغة." });
  try {
    const { rows } = await pool.query("UPDATE notes SET content = $1 WHERE id = $2 RETURNING *", [
      content.trim(),
      req.params.noteId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "الملاحظة غير موجودة." });
    res.json(rows[0]);
  } catch (err) {
    console.error("update note error", err);
    res.status(500).json({ error: "تعذّر تعديل الملاحظة." });
  }
});

module.exports = router;
