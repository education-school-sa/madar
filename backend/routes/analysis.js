const express = require("express");
const pool = require("../db");

const router = express.Router();

// تحليل لكل طالبة: درجاتها وتطورها ومهاراتها
router.get("/student/:id", async (req, res) => {
  try {
    const { rows: results } = await pool.query(
      `SELECT t.title, t.type, tr.score, t.total_points, tr.submitted_at
       FROM test_results tr JOIN tests t ON t.id = tr.test_id
       WHERE tr.student_id = $1 AND tr.status = 'completed'
       ORDER BY tr.submitted_at`,
      [req.params.id]
    );
    const { rows: skills } = await pool.query(
      `SELECT sk.name, ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id = ss.skill_id
       WHERE ss.student_id = $1 ORDER BY ss.mastery_percent DESC`,
      [req.params.id]
    );
    const mastered = skills.filter((s) => s.mastery_percent >= 70);
    const needsSupport = skills.filter((s) => s.mastery_percent < 50);
    res.json({ results, skills, mastered, needsSupport });
  } catch (err) {
    console.error("student analysis error", err);
    res.status(500).json({ error: "تعذّر تحميل تحليل الطالبة." });
  }
});

// تحليل الفصل العام
router.get("/class", async (req, res) => {
  try {
    const { classId = "", testId = "" } = req.query;
    const params = [];
    let studentFilter = "";
    if (classId) {
      params.push(Number(classId));
      studentFilter = `WHERE s.class_id = $${params.length}`;
    }
    const { rows: studentsRows } = await pool.query(
      `SELECT s.id, s.progress_percent FROM students s ${studentFilter}`,
      params
    );
    const progressValues = studentsRows.map((s) => s.progress_percent);
    const average = progressValues.length
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : 0;
    const highest = progressValues.length ? Math.max(...progressValues) : 0;
    const lowest = progressValues.length ? Math.min(...progressValues) : 0;
    const passCount = progressValues.filter((p) => p >= 50).length;
    const passRate = progressValues.length ? Math.round((passCount / progressValues.length) * 100) : 0;

    const distributionBuckets = [
      { label: "0-39", min: 0, max: 39 },
      { label: "40-59", min: 40, max: 59 },
      { label: "60-79", min: 60, max: 79 },
      { label: "80-100", min: 80, max: 100 },
    ];
    const distribution = distributionBuckets.map((b) => ({
      label: b.label,
      count: progressValues.filter((p) => p >= b.min && p <= b.max).length,
    }));

    let prePostComparison = null;
    if (testId) {
      const { rows: cmp } = await pool.query(
        `SELECT t.type, COALESCE(AVG(tr.score),0)::float AS avg_score, t.total_points
         FROM tests t LEFT JOIN test_results tr ON tr.test_id = t.id AND tr.status = 'completed'
         WHERE t.id = $1 GROUP BY t.type, t.total_points`,
        [testId]
      );
      prePostComparison = cmp;
    } else {
      const { rows: cmp } = await pool.query(
        `SELECT t.type, COALESCE(AVG(tr.score::float / GREATEST(t.total_points,1) * 100),0)::int AS avg_percent
         FROM tests t LEFT JOIN test_results tr ON tr.test_id = t.id AND tr.status = 'completed'
         WHERE t.type IN ('pre_diagnostic','post_diagnostic')
         GROUP BY t.type`
      );
      prePostComparison = cmp;
    }

    res.json({ average, highest, lowest, passRate, distribution, prePostComparison, studentCount: progressValues.length });
  } catch (err) {
    console.error("class analysis error", err);
    res.status(500).json({ error: "تعذّر تحميل تحليل الفصل." });
  }
});

// تحليل كل مهارة
router.get("/skills", async (req, res) => {
  try {
    const { rows: skills } = await pool.query("SELECT id, name FROM skills ORDER BY name");
    const results = [];
    for (const skill of skills) {
      const { rows: masteryRows } = await pool.query(
        "SELECT student_id, mastery_percent FROM student_skills WHERE skill_id = $1",
        [skill.id]
      );
      const mastered = masteryRows.filter((m) => m.mastery_percent >= 70).length;
      const needsSupport = masteryRows.filter((m) => m.mastery_percent < 50).length;
      const avg = masteryRows.length
        ? Math.round(masteryRows.reduce((a, b) => a + b.mastery_percent, 0) / masteryRows.length)
        : 0;

      const { rows: needsSupportNames } = await pool.query(
        `SELECT s.id, s.name FROM student_skills ss JOIN students s ON s.id = ss.student_id
         WHERE ss.skill_id = $1 AND ss.mastery_percent < 50 ORDER BY ss.mastery_percent ASC LIMIT 10`,
        [skill.id]
      );

      results.push({
        skillId: skill.id,
        name: skill.name,
        averageMastery: avg,
        masteredCount: mastered,
        needsSupportCount: needsSupport,
        needsSupportStudents: needsSupportNames,
      });
    }
    res.json(results);
  } catch (err) {
    console.error("skills analysis error", err);
    res.status(500).json({ error: "تعذّر تحميل تحليل المهارات." });
  }
});

module.exports = router;
