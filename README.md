# Redis OSS Manager

A control plane for managing multi-tenant Redis OSS clusters. Built with FastAPI (Python) and Next.js.

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL (running locally or remotely)

---

## Backend

### Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Environment

Copy the example env file and edit as needed:

```bash
cp .env.example .env
```

Default values in `.env.example`:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/redis_manager
HEALTH_POLL_INTERVAL=30.0
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:3000"]
```

### Run (development)

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API available at: http://localhost:8000

Interactive docs: http://localhost:8000/docs

### Run tests

```bash
pytest
```

---

## Frontend

### Setup

```bash
cd frontend
npm install
```

### Run (development)

```bash
npm run dev
```

App available at: http://localhost:3000

### Build for production

```bash
npm run build
npm start
```

---

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy (async), PostgreSQL |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Redis | redis-py 5 with hiredis |
| Data fetching | SWR |
| Charts | Recharts |
