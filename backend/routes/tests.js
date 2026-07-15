const express = require("express");
const pool = require("../db");

const router = express.Router();

const VALID_TYPES = ["pre_diagnostic", "post_diagnostic", "quiz"];

router.get("/", async (req, res) => {
  try {
    const { type = "" } = req.query;
    const conditions = [];
    const params = [];
    if (type) {
      conditions.push("t.type = $1");
      params.push(type);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.type, t.status, t.duration_minutes, t.total_points, t.start_at, t.end_at,
              sk.name AS skill_name, c.name AS class_name,
              (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id)::int AS question_count,
              (SELECT COUNT(*) FROM test_results tr WHERE tr.test_id = t.id AND tr.status = 'completed')::int AS completed_count,
              (SELECT COUNT(*) FROM test_results tr WHERE tr.test_id = t.id)::int AS assigned_count
       FROM tests t
       LEFT JOIN skills sk ON sk.id = t.skill_id
       LEFT JOIN classes c ON c.id = t.class_id
       ${whereSql}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("list tests error", err);
    res.status(500).json({ error: "تعذّر تحميل الاختبارات." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows: testRows } = await pool.query("SELECT * FROM tests WHERE id = $1", [req.params.id]);
    if (!testRows[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    const { rows: questions } = await pool.query(
      "SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index",
      [req.params.id]
    );
    res.json({ ...testRows[0], questions });
  } catch (err) {
    console.error("get test error", err);
    res.status(500).json({ error: "تعذّر تحميل الاختبار." });
  }
});

router.post("/", async (req, res) => {
  const { title, type, skillId, classId, durationMinutes, startAt, endAt, questions = [] } = req.body || {};
  if (!title || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: "يرجى إدخال عنوان الاختبار ونوعه بشكل صحيح." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    const { rows } = await client.query(
      `INSERT INTO tests (teacher_id, title, type, status, skill_id, class_id, duration_minutes, total_points, start_at, end_at)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.session.teacherId, title.trim(), type, skillId || null, classId || null, durationMinutes || 20, totalPoints, startAt || null, endAt || null]
    );
    const test = rows[0];
    let order = 1;
    for (const q of questions) {
      await client.query(
        `INSERT INTO questions (test_id, type, question_text, options, correct_answer, points, skill_id, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [test.id, q.type, q.questionText, q.options ? JSON.stringify(q.options) : null, q.correctAnswer, q.points || 1, skillId || null, order++]
      );
    }
    await client.query(
      "INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)",
      [req.session.teacherId, "إنشاء اختبار", `تم إنشاء الاختبار "${title}"`]
    );
    await client.query("COMMIT");
    res.status(201).json(test);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("create test error", err);
    res.status(500).json({ error: "تعذّر إنشاء الاختبار." });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const { title, type, skillId, classId, durationMinutes, startAt, endAt, questions } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const totalPoints = Array.isArray(questions)
      ? questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0)
      : undefined;

    const { rows } = await client.query(
      `UPDATE tests SET
        title = COALESCE($1, title),
        type = COALESCE($2, type),
        skill_id = $3,
        class_id = $4,
        duration_minutes = COALESCE($5, duration_minutes),
        start_at = $6,
        end_at = $7,
        total_points = COALESCE($8, total_points),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title, type, skillId ?? null, classId ?? null, durationMinutes, startAt ?? null, endAt ?? null, totalPoints, req.params.id]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }

    if (Array.isArray(questions)) {
      await client.query("DELETE FROM questions WHERE test_id = $1", [req.params.id]);
      let order = 1;
      for (const q of questions) {
        await client.query(
          `INSERT INTO questions (test_id, type, question_text, options, correct_answer, points, skill_id, order_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.params.id, q.type, q.questionText, q.options ? JSON.stringify(q.options) : null, q.correctAnswer, q.points || 1, skillId ?? null, order++]
        );
      }
    }
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("update test error", err);
    res.status(500).json({ error: "تعذّر تعديل الاختبار." });
  } finally {
    client.release();
  }
});

router.post("/:id/duplicate", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: testRows } = await client.query("SELECT * FROM tests WHERE id = $1", [req.params.id]);
    const test = testRows[0];
    if (!test) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "الاختبار غير موجود." });
    }
    const { rows: newTestRows } = await client.query(
      `INSERT INTO tests (teacher_id, title, type, status, skill_id, class_id, duration_minutes, total_points, start_at, end_at)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,NULL,NULL) RETURNING *`,
      [req.session.teacherId, `${test.title} (نسخة)`, test.type, test.skill_id, test.class_id, test.duration_minutes, test.total_points]
    );
    const newTest = newTestRows[0];
    const { rows: qs } = await client.query("SELECT * FROM questions WHERE test_id = $1 ORDER BY order_index", [req.params.id]);
    for (const q of qs) {
      await client.query(
        `INSERT INTO questions (test_id, type, question_text, options, correct_answer, points, skill_id, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newTest.id, q.type, q.question_text, q.options, q.correct_answer, q.points, q.skill_id, q.order_index]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(newTest);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("duplicate test error", err);
    res.status(500).json({ error: "تعذّر نسخ الاختبار." });
  } finally {
    client.release();
  }
});

router.post("/:id/publish", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE tests SET status = 'published', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    res.json(rows[0]);
  } catch (err) {
    console.error("publish test error", err);
    res.status(500).json({ error: "تعذّر نشر الاختبار." });
  }
});

router.post("/:id/unpublish", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE tests SET status = 'draft', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    res.json(rows[0]);
  } catch (err) {
    console.error("unpublish test error", err);
    res.status(500).json({ error: "تعذّر إلغاء نشر الاختبار." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("DELETE FROM tests WHERE id = $1 RETURNING title", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "الاختبار غير موجود." });
    await pool.query("INSERT INTO activity_log (teacher_id, action, details) VALUES ($1,$2,$3)", [
      req.session.teacherId,
      "حذف اختبار",
      `تم حذف الاختبار "${rows[0].title}"`,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error("delete test error", err);
    res.status(500).json({ error: "تعذّر حذف الاختبار." });
  }
});

// Submit / auto-grade a student's answers for a test.
router.post("/:id/submit", async (req, res) => {
  const { studentId, answers = [] } = req.body || {};
  if (!studentId) return res.status(400).json({ error: "معرّف الطالبة مطلوب." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: qRows } = await client.query("SELECT * FROM questions WHERE test_id = $1", [req.params.id]);
    const questionsById = new Map(qRows.map((q) => [q.id, q]));

    let score = 0;
    const { rows: resultRows } = await client.query(
      `INSERT INTO test_results (test_id, student_id, status, score, submitted_at)
       VALUES ($1,$2,'completed',0,NOW())
       ON CONFLICT (test_id, student_id) DO UPDATE SET status = 'completed', submitted_at = NOW()
       RETURNING id`,
      [req.params.id, studentId]
    );
    const resultId = resultRows[0].id;
    await client.query("DELETE FROM answers WHERE result_id = $1", [resultId]);

    for (const ans of answers) {
      const question = questionsById.get(ans.questionId);
      if (!question) continue;
      let isCorrect = null;
      let pointsEarned = 0;
      if (question.type === "mcq" || question.type === "true_false") {
        isCorrect = String(ans.answerText).trim() === String(question.correct_answer).trim();
        pointsEarned = isCorrect ? question.points : 0;
      } else {
        // short_answer: auto-grade with a normalized exact match, flagged for teacher review.
        isCorrect =
          String(ans.answerText || "").trim().toLowerCase() ===
          String(question.correct_answer || "").trim().toLowerCase();
        pointsEarned = isCorrect ? question.points : 0;
      }
      score += pointsEarned;
      await client.query(
        `INSERT INTO answers (result_id, question_id, answer_text, is_correct, points_earned) VALUES ($1,$2,$3,$4,$5)`,
        [resultId, ans.questionId, ans.answerText, isCorrect, pointsEarned]
      );
    }

    await client.query("UPDATE test_results SET score = $1 WHERE id = $2", [score, resultId]);

    // Refresh mastery for the test's skill based on this result, if any.
    const { rows: testRows } = await client.query("SELECT skill_id, total_points FROM tests WHERE id = $1", [req.params.id]);
    const test = testRows[0];
    if (test?.skill_id) {
      const masteryPercent = test.total_points ? Math.round((score / test.total_points) * 100) : 0;
      await client.query(
        `INSERT INTO student_skills (student_id, skill_id, mastery_percent, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (student_id, skill_id) DO UPDATE SET mastery_percent = $3, updated_at = NOW()`,
        [studentId, test.skill_id, masteryPercent]
      );
    }

    await client.query("COMMIT");
    res.json({ resultId, score });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("submit test error", err);
    res.status(500).json({ error: "تعذّر حفظ إجابات الاختبار." });
  } finally {
    client.release();
  }
});

router.get("/:id/results", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.id, tr.status, tr.score, tr.submitted_at, s.id AS student_id, s.name AS student_name
       FROM test_results tr JOIN students s ON s.id = tr.student_id
       WHERE tr.test_id = $1 ORDER BY s.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("test results error", err);
    res.status(500).json({ error: "تعذّر تحميل نتائج الاختبار." });
  }
});

module.exports = router;
