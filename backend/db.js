const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'cyber',
      password: process.env.DB_PASSWORD || 'cyber_pass_2026',
      database: process.env.DB_NAME || 'cyber_chatbot',
    }
);

// Auto-create tables on first run
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Database tables ready');
  } finally {
    client.release();
  }
}

// Get active session count for a user
async function getActiveSessionCount(userName) {
  const result = await pool.query(
    'SELECT COUNT(*) FROM sessions WHERE user_name = $1',
    [userName]
  );
  return parseInt(result.rows[0].count);
}

// Create a new session
async function createSession(userName) {
  const count = await getActiveSessionCount(userName);
  if (count >= 3) {
    throw new Error('MAX_SESSIONS_REACHED');
  }

  const result = await pool.query(
    'INSERT INTO sessions (user_name) VALUES ($1) RETURNING id, user_name, created_at',
    [userName]
  );
  return result.rows[0];
}

// Get all sessions for a specific user
async function getSessionsByUserName(userName) {
  const result = await pool.query(
    `SELECT id, created_at, 
      (SELECT COUNT(*) FROM messages WHERE session_id = sessions.id) as message_count
     FROM sessions 
     WHERE user_name = $1 
     ORDER BY created_at DESC`,
    [userName]
  );
  return result.rows;
}

// Save a message
async function saveMessage(sessionId, role, content) {
  const result = await pool.query(
    'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at',
    [sessionId, role, content]
  );
  return result.rows[0];
}

// Get conversation history for a session
async function getHistory(sessionId) {
  const result = await pool.query(
    'SELECT id, role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId]
  );
  return result.rows;
}

// Get all sessions (for admin/analytics)
async function getAllSessions() {
  const result = await pool.query(
    `SELECT s.id, s.user_name, s.created_at, COUNT(m.id) as message_count
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC`
  );
  return result.rows;
}

// Search sessions and messages (admin search)
async function searchLogs({ userName, dateFrom, dateTo, content }) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (userName && userName.trim()) {
    conditions.push(`s.user_name ILIKE $${paramIdx}`);
    params.push(`%${userName.trim()}%`);
    paramIdx++;
  }

  if (dateFrom) {
    conditions.push(`s.created_at >= $${paramIdx}`);
    params.push(dateFrom);
    paramIdx++;
  }

  if (dateTo) {
    conditions.push(`s.created_at <= $${paramIdx}`);
    params.push(dateTo);
    paramIdx++;
  }

  // If searching by content, join messages and filter
  if (content && content.trim()) {
    const contentQuery = `
      SELECT 
        s.id, s.user_name, s.created_at,
        COUNT(m.id) as message_count,
        json_agg(
          json_build_object('id', m.id, 'role', m.role, 'content', m.content, 'created_at', m.created_at)
          ORDER BY m.created_at ASC
        ) FILTER (WHERE m.id IS NOT NULL) as messages
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.id IN (
        SELECT DISTINCT session_id FROM messages WHERE content ILIKE $${paramIdx}
      )
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 50
    `;
    params.push(`%${content.trim()}%`);
    const result = await pool.query(contentQuery, params);
    return result.rows;
  }

  // No content filter — search sessions only
  const sessionQuery = `
    SELECT 
      s.id, s.user_name, s.created_at,
      COUNT(m.id) as message_count,
      json_agg(
        json_build_object('id', m.id, 'role', m.role, 'content', m.content, 'created_at', m.created_at)
        ORDER BY m.created_at ASC
      ) FILTER (WHERE m.id IS NOT NULL) as messages
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 50
  `;
  const result = await pool.query(sessionQuery, params);
  return result.rows;
}

// Delete a session and its messages (CASCADE handles messages)
async function deleteSession(sessionId) {
  const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [sessionId]);
  return result.rowCount > 0;
}

module.exports = {
  pool, initDB, createSession, saveMessage, getHistory,
  getAllSessions, searchLogs, deleteSession,
  getSessionsByUserName, getActiveSessionCount
};
