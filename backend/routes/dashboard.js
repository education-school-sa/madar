const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    const [{ rows: studentCount }, { rows: publishedTests }, { rows: completedResults }, { rows: avgProgress }, { rows: needSupport }] =
      await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM students"),
        pool.query("SELECT COUNT(*)::int AS count FROM tests WHERE status = 'published'"),
        pool.query("SELECT COUNT(*)::int AS count FROM test_results WHERE status = 'completed'"),
        pool.query("SELECT COALESCE(AVG(progress_percent),0)::int AS avg FROM students"),
        pool.query("SELECT COUNT(*)::int AS count FROM students WHERE progress_percent < 50"),
      ]);

    const { rows: byClass } = await pool.query(`
      SELECT c.name, COALESCE(AVG(s.progress_percent),0)::int AS avg_progress, COUNT(s.id)::int AS student_count
      FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.id
    `);

    const { rows: recentActivity } = await pool.query(
      "SELECT action, details, created_at FROM activity_log ORDER BY created_at DESC LIMIT 8"
    );

    const { rows: notifications } = await pool.query(
      "SELECT id, title, message, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 5"
    );

    res.json({
      studentCount: studentCount[0].count,
      publishedTests: publishedTests[0].count,
      completedResults: completedResults[0].count,
      averageProgress: avgProgress[0].avg,
      needSupportCount: needSupport[0].count,
      classLevels: byClass,
      recentActivity,
      notifications,
    });
  } catch (err) {
    console.error("dashboard summary error", err);
    res.status(500).json({ error: "تعذّر تحميل بيانات الرئيسية." });
  }
});

module.exports = router;
