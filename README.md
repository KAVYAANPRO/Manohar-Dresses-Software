# Manohar Dresses — ERP

Garment manufacturing ERP: purchase & inward (thans, lot numbers), stock, job work
(processing / dyeing and making), receiving, costing, ready stock & packing, sales, GST
invoicing, payments, dashboards and reports. Built mobile-first.

| Folder | What |
|---|---|
| `frontend/` | React 19 + Vite + TypeScript + Tailwind (mobile-first web app) |
| `backend/` | NestJS + Mongoose (MongoDB) API |
| `prd.md`, `prd_1.md`, `tech_1.md`, `plan.md`, `frontend.md` | Product & technical specs |

## Run locally

```bash
# backend (needs backend/.env — copy backend/.env.example and fill it in)
cd backend && npm install && npm run start:dev

# frontend (proxies /api to the backend; see frontend/vite.config.ts)
cd frontend && npm install && npm run dev
```

Never commit `backend/.env` — it holds the database URI and secrets.
