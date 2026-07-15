// PostgreSQL connection pool shared by the teacher-dashboard backend.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
