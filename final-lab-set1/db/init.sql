-- ═══════════════════════════════════════════════
--  USERS TABLE (auth-service ใช้)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  DEFAULT 'member',   -- 'member' | 'admin'
  created_at    TIMESTAMP    DEFAULT NOW(),
  last_login    TIMESTAMP
);

-- ═══════════════════════════════════════════════
--  TASKS TABLE (task-service ใช้)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  status      VARCHAR(20)  DEFAULT 'TODO'    CHECK (status IN ('TODO','IN_PROGRESS','DONE')),
  priority    VARCHAR(10)  DEFAULT 'medium'  CHECK (priority IN ('low','medium','high')),
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);

-- ═══════════════════════════════════════════════
--  LOGS TABLE (log-service ใช้)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS logs (
  id         SERIAL       PRIMARY KEY,
  service    VARCHAR(50)  NOT NULL,   -- 'auth-service' | 'task-service'
  level      VARCHAR(10)  NOT NULL    CHECK (level IN ('INFO','WARN','ERROR')),
  event      VARCHAR(100) NOT NULL,   -- 'LOGIN_SUCCESS' | 'JWT_INVALID' | ...
  user_id    INTEGER,                 -- nullable
  ip_address VARCHAR(45),
  method     VARCHAR(10),             -- HTTP method
  path       VARCHAR(255),            -- request path
  status_code INTEGER,                -- HTTP response code
  message    TEXT,
  meta       JSONB,
  created_at TIMESTAMP    DEFAULT NOW()
);

-- Index สำหรับ query เร็ว
CREATE INDEX IF NOT EXISTS idx_logs_service    ON logs(service);
CREATE INDEX IF NOT EXISTS idx_logs_level      ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);

-- ═══════════════════════════════════════════════
--  SEED USERS
--  ⚠️  Plain-text passwords (สำหรับอาจารย์/นักศึกษารู้)
--  bcrypt hash ด้านล่างคือ bcrypt(password, saltRounds=10)
-- ═══════════════════════════════════════════════
-- alice123      → $2a$10$YourHashHere...
-- bob456        → $2a$10$YourHashHere...
-- adminpass     → $2a$10$YourHashHere...
--
-- วิธีสร้าง hash ใหม่ (node REPL):
--   const b = require('bcryptjs');
--   console.log(b.hashSync('alice123', 10));
-- ═══════════════════════════════════════════════

INSERT INTO users (username, email, password_hash, role) VALUES
  (
    'alice',
    'alice@lab.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    -- plain-text password: alice123
    'member'
  ),
  (
    'bob',
    'bob@lab.local',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    -- plain-text password: bob456
    'member'
  ),
  (
    'admin',
    'admin@lab.local',
    '$2a$10$TbAyBo.OirXRwMvBVMGgXeuHfzaOGicB5K3jZ1WZUD/pDYdm6GS7C',
    -- plain-text password: adminpass
    'admin'
  )
ON CONFLICT DO NOTHING;

-- Seed tasks (optional — ให้มีข้อมูลตั้งต้น)
INSERT INTO tasks (user_id, title, description, status, priority)
SELECT u.id, 'ออกแบบ UI หน้า Login', 'ใช้ Figma ออกแบบ mockup', 'TODO', 'high'
FROM users u WHERE u.username = 'alice'
ON CONFLICT DO NOTHING;

INSERT INTO tasks (user_id, title, description, status, priority)
SELECT u.id, 'เขียน API สำหรับ Task CRUD', 'Express.js + PostgreSQL', 'IN_PROGRESS', 'high'
FROM users u WHERE u.username = 'alice'
ON CONFLICT DO NOTHING;

INSERT INTO tasks (user_id, title, description, status, priority)
SELECT u.id, 'ทดสอบ JWT Authentication', 'ใช้ Postman ทดสอบทุก endpoint', 'TODO', 'medium'
FROM users u WHERE u.username = 'bob'
ON CONFLICT DO NOTHING;

INSERT INTO tasks (user_id, title, description, status, priority)
SELECT u.id, 'Deploy บน Railway', 'ทำ Final Lab ชุดที่ 2', 'TODO', 'medium'
FROM users u WHERE u.username = 'admin'
ON CONFLICT DO NOTHING;