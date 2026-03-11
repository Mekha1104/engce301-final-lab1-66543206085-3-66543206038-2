require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

// DB connection (ใช้ shared DB เดียวกัน)
const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'taskboard',
  user:     process.env.DB_USER     || 'admin',
  password: process.env.DB_PASSWORD || 'secret123',
});

const jwt = require('jsonwebtoken');
function verifyJWT(req, res, next) {
  const token = (req.headers['authorization']||'').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ══════════════════════════════════════════════════════
// POST /api/logs/internal — รับ log จาก services อื่น
// (internal — ไม่ต้อง JWT เพราะ call ภายใน Docker network)
// ══════════════════════════════════════════════════════
app.post('/api/logs/internal', async (req, res) => {
  const { service, level, event, user_id, ip_address,
          method, path, status_code, message, meta } = req.body;

  if (!service || !level || !event) {
    return res.status(400).json({ error: 'service, level, event are required' });
  }

  try {
    await pool.query(
      `INSERT INTO logs (service, level, event, user_id, ip_address,
                         method, path, status_code, message, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [service, level, event, user_id || null, ip_address || null,
       method || null, path || null, status_code || null,
       message || null, meta ? JSON.stringify(meta) : null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[LOG] Insert error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/logs/ — ดึง logs (ต้องมี JWT)
// Query params: ?service=auth-service&level=ERROR&limit=50&offset=0
// ══════════════════════════════════════════════════════
app.get('/api/logs/', verifyJWT, async (req, res) => {
  const { service, level, event, limit = 100, offset = 0 } = req.query;

  // Build dynamic WHERE clause
  const conditions = [];
  const values     = [];
  let   idx = 1;

  if (service) { conditions.push(`service = $${idx++}`); values.push(service); }
  if (level)   { conditions.push(`level = $${idx++}`);   values.push(level);   }
  if (event)   { conditions.push(`event = $${idx++}`);   values.push(event);   }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM logs ${where}`, values);
    const total       = parseInt(countResult.rows[0].count);

    values.push(parseInt(limit));
    values.push(parseInt(offset));
    const result = await pool.query(
      `SELECT * FROM logs ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      values
    );

    res.json({
      logs:   result.rows,
      total,
      limit:  parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('[LOG] Query error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/logs/stats — สถิติ logs (ต้องมี JWT)
// ══════════════════════════════════════════════════════
app.get('/api/logs/stats', verifyJWT, async (req, res) => {
  try {
    const byLevel = await pool.query(
      `SELECT level, COUNT(*) as count FROM logs GROUP BY level`
    );
    const byService = await pool.query(
      `SELECT service, COUNT(*) as count FROM logs GROUP BY service`
    );
    const byEvent = await pool.query(
      `SELECT event, COUNT(*) as count FROM logs GROUP BY event ORDER BY count DESC LIMIT 10`
    );
    const recent24h = await pool.query(
      `SELECT COUNT(*) as count FROM logs WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    res.json({
      by_level:   byLevel.rows,
      by_service: byService.rows,
      top_events: byEvent.rows,
      last_24h:   parseInt(recent24h.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/logs/health
app.get('/api/logs/health', (_, res) => res.json({ status:'ok', service:'log-service' }));

// Start
async function start() {
  let retries = 10;
  while (retries > 0) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      console.log(`[log-service] Waiting for DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`[log-service] Running on :${PORT}`));
}
start();