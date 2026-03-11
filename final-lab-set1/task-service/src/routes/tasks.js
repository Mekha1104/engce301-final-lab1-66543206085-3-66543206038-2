const express       = require('express');
const { pool }      = require('../db/db');
const requireAuth   = require('../middleware/authMiddleware');

const router = express.Router();

// Helper: ส่ง log
async function logEvent(data) {
  try {
    await fetch('http://log-service:3003/api/logs/internal', {
      method:  'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'task-service', ...data })
    });
  } catch (_) {}
}

// ทุก route ต้องผ่าน JWT middleware
router.use(requireAuth);

// GET /api/tasks/ — ดึง tasks (admin เห็นทั้งหมด, member เห็นแค่ของตัวเอง)
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query(`
        SELECT t.*, u.username FROM tasks t
        JOIN users u ON t.user_id = u.id
        ORDER BY t.created_at DESC`);
    } else {
      result = await pool.query(`
        SELECT t.*, u.username FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = $1 ORDER BY t.created_at DESC`, [req.user.sub]);
    }
    res.json({ tasks: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/ — สร้าง task ใหม่
router.post('/', async (req, res) => {
  const { title, description, status = 'TODO', priority = 'medium' } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, priority)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.sub, title, description, status, priority]
    );
    const task = result.rows[0];
    await logEvent({ level:'INFO', event:'TASK_CREATED', userId: req.user.sub,
      method:'POST', path:'/api/tasks', statusCode:201,
      message: `Task created: "${title}"`, meta: { task_id: task.id, title } });
    res.status(201).json({ task });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id — แก้ไข task (เฉพาะเจ้าของหรือ admin)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });
    if (check.rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { title, description, status, priority } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET title=COALESCE($1,title), description=COALESCE($2,description),
       status=COALESCE($3,status), priority=COALESCE($4,priority), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title, description, status, priority, id]
    );
    res.json({ task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id — ลบ task (เฉพาะเจ้าของหรือ admin)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Task not found' });
    if (check.rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    await logEvent({ level:'INFO', event:'TASK_DELETED', userId: req.user.sub,
      method:'DELETE', path:`/api/tasks/${id}`, statusCode:200,
      message: `Task ${id} deleted` });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/health
router.get('/health', (_, res) => res.json({ status:'ok', service:'task-service' }));

module.exports = router;