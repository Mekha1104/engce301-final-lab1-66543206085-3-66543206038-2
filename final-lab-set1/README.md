# 🔐 ENGCE301 Final Lab — Set 1: Microservices + HTTPS + Lightweight Logging

**ชื่อนักศึกษา:**
- ปรเมษฐ สุริคำ — รหัส 66543206038-2
- นายเมย์คาร์ สุวรรณวิสุทธิ์ — รหัส 66543206085-3

---

## 🏗️ Architecture Diagram

```
Browser / Postman / curl
        │
        │ HTTPS :443  (HTTP :80 → redirect HTTPS)
        ▼
┌──────────────────────────────────────────────────────────────┐
│  🛡️ Nginx (API Gateway + TLS Termination + Rate Limiter)     │
│                                                              │
│  /api/auth/*   → auth-service:3001   (rate: 5 login/min)    │
│  /api/tasks/*  → task-service:3002   [JWT required]          │
│  /api/logs/*   → log-service:3003    [JWT required]          │
│  /             → frontend:80         (Static HTML)           │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌────────────────┐  ┌─────────────────┐
│ 🔑 Auth Svc  │  │ 📋 Task Svc    │  │ 📝 Log Service  │
│   :3001      │  │   :3002        │  │   :3003         │
│              │  │                │  │                 │
│ • POST login │  │ • GET  /tasks  │  │ • POST internal │
│ • GET verify │  │ • POST /tasks  │  │ • GET  /logs    │
│ • GET /me    │  │ • PUT  /tasks  │  │ • GET  /stats   │
│ • GET health │  │ • DELETE tasks │  │ • GET  health   │
└──────┬───────┘  └───────┬────────┘  └────────┬────────┘
       │                  │                     │
       └──────────────────┴─────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  🗄️ PostgreSQL :5432   │
              │  (1 shared database)  │
              │  • users   table      │
              │  • tasks   table      │
              │  • logs    table      │
              └───────────────────────┘
```

---

## 🚀 วิธีรัน

### 1. Clone & Setup
```bash
git clone <repo-url>
cd final-lab-set1
```

### 2. สร้าง Self-Signed Certificate
```bash
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh
```

หรือรันด้วย OpenSSL โดยตรง (ถ้า script ไม่ทำงาน):
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/key.pem \
  -out    nginx/certs/cert.pem \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=RMUTL/OU=ENGCE301/CN=localhost"
```

### 3. ตั้งค่า Environment Variables
```bash
cp .env.example .env
```

### 4. Build & Run
```bash
docker compose up --build
```

### 5. เปิด Browser
- Task Board: **https://localhost**
- Log Dashboard: **https://localhost/logs.html**

> ⚠️ Browser จะแจ้งเตือน "Connection not secure" เพราะเป็น self-signed cert — กด Advanced → Proceed to localhost

---

## 🔑 Seed Users

| Username | Email | Password | Role |
|----------|-------|----------|------|
| alice | alice@lab.local | alice123 | member |
| bob | bob@lab.local | bob456 | member |
| admin | admin@lab.local | adminpass | admin |

---

## 🌐 HTTPS Flow อธิบาย

1. **Client** ส่ง HTTP request ไปที่ port 80
2. **Nginx** รับ request ที่ port 80 → redirect 301 ไปยัง `https://` (port 443)
3. **Client** ส่ง HTTPS request ไปที่ port 443
4. **Nginx** ทำ **TLS Termination** — ถอดรหัส HTTPS ด้วย self-signed certificate (`cert.pem`, `key.pem`)
5. **Nginx** ส่ง request ต่อไปยัง backend services ผ่าน HTTP บน Docker internal network (ปลอดภัยเพราะอยู่ใน network เดียวกัน)
6. **Backend services** ตอบกลับ → Nginx เข้ารหัสกลับเป็น HTTPS ส่งให้ client

### Security Headers ที่ใช้:
- `Strict-Transport-Security` — บังคับ HTTPS ต่อไปใน 1 ปี
- `X-Frame-Options: DENY` — ป้องกัน clickjacking
- `X-Content-Type-Options: nosniff` — ป้องกัน MIME sniffing
- `X-XSS-Protection` — ป้องกัน XSS

### Rate Limiting:
- `/api/auth/login` — จำกัด **5 requests/นาที** (ป้องกัน brute force)
- `/api/tasks/*`, `/api/logs/*` — จำกัด **30 requests/นาที**

---

## 📋 API Endpoints

### Auth Service (port 3001)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | ❌ | Login รับ JWT |
| GET | /api/auth/verify | ❌ | ตรวจสอบ JWT |
| GET | /api/auth/me | ✅ JWT | ข้อมูล user ปัจจุบัน |
| GET | /api/auth/health | ❌ | Health check |

### Task Service (port 3002)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/tasks/ | ✅ JWT | ดึง tasks |
| POST | /api/tasks/ | ✅ JWT | สร้าง task |
| PUT | /api/tasks/:id | ✅ JWT | แก้ไข task |
| DELETE | /api/tasks/:id | ✅ JWT | ลบ task |

### Log Service (port 3003)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/logs/internal | ❌ internal | รับ log จาก services |
| GET | /api/logs/ | ✅ JWT | ดึง logs |
| GET | /api/logs/stats | ✅ JWT | สถิติ logs |

---

## 📝 Log Events

| Event | Service | Level | เมื่อไหร่ |
|-------|---------|-------|----------|
| LOGIN_SUCCESS | auth-service | INFO | login ถูกต้อง |
| LOGIN_FAILED | auth-service | WARN | password ผิด |
| JWT_INVALID | task-service | ERROR | token ผิด/หมดอายุ |
| TASK_CREATED | task-service | INFO | สร้าง task |
| TASK_UPDATED | task-service | INFO | แก้ไข task |
| TASK_DELETED | task-service | INFO | ลบ task |

---

## 📁 Project Structure

```
final-lab-set1/
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── nginx/
│   ├── nginx.conf          ← HTTPS + rate limit + reverse proxy
│   ├── Dockerfile
│   └── certs/              ← self-signed cert (gen-certs.sh)
├── frontend/
│   ├── Dockerfile
│   ├── index.html          ← Task Board UI
│   └── logs.html           ← Log Dashboard
├── auth-service/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── routes/auth.js
│       ├── middleware/jwtUtils.js
│       └── db/db.js
├── task-service/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── jwtUtils.js
│       ├── db.js
│       ├── routes/tasks.js
│       └── middleware/authMiddleware.js
├── log-service/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── db/
│   └── init.sql            ← Schema + Seed Users
└── scripts/
    └── gen-certs.sh        ← สร้าง self-signed cert
```

---

## 🧪 Test Commands

```bash
BASE="https://localhost"

# Login
TOKEN=$(curl -sk -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@lab.local","password":"alice123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Create Task
curl -sk -X POST $BASE/api/tasks/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task","priority":"high"}'

# Get Tasks
curl -sk $BASE/api/tasks/ -H "Authorization: Bearer $TOKEN"

# View Logs
curl -sk $BASE/api/logs/ -H "Authorization: Bearer $TOKEN"

# Test 401 (no JWT)
curl -sk $BASE/api/tasks/

# Test Rate Limit
for i in {1..8}; do
  echo -n "Attempt $i: "
  curl -sk -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.com","password":"wrong"}'
  sleep 0.1
done
```