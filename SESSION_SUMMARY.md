# Portfolio Tracker — Session Summary
**Date:** 17 April 2026

## Project Overview
**Stack:** React (Vite) frontend + Python FastAPI backend + PostgreSQL (DBeaver)  
**Goal:** Build a full-stack portfolio tracker for managing client stock trades with live NSE prices, P&L calculations, and benchmark comparison vs Nifty 50.

---

## Database Schema (Finalized)

### Run in DBeaver:
```sql
CREATE SCHEMA portfolio_tracker;

CREATE TABLE portfolio_tracker.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    joining_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE portfolio_tracker.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE,
    stock_symbol VARCHAR(20) NOT NULL,
    type VARCHAR(4) NOT NULL CHECK (type IN ('BUY', 'SELL')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(15,2) NOT NULL CHECK (price > 0),
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_client_id ON portfolio_tracker.trades(client_id);
CREATE INDEX idx_trades_stock_symbol ON portfolio_tracker.trades(stock_symbol);
CREATE INDEX idx_trades_date ON portfolio_tracker.trades(date);
```

### ALTER TABLE migrations already run:
```sql
ALTER TABLE portfolio_tracker.clients ADD COLUMN phone VARCHAR(20);
ALTER TABLE portfolio_tracker.clients ADD COLUMN email VARCHAR(255);
ALTER TABLE portfolio_tracker.clients ADD COLUMN joining_date DATE;
```

---

## Backend (Python FastAPI)

**Location:** `portfolio-tracker/backend/`  
**Start command:**
```bash
cd portfolio-tracker/backend
source .venv/bin/activate
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Files:
| File | Purpose |
|---|---|
| `main.py` | All API routes |
| `db.py` | PostgreSQL connection via psycopg2 |
| `requirements.txt` | Dependencies |
| `.env` | Your secrets (not committed) |
| `.env.example` | Template |
| `.venv/` | Virtual environment (already installed) |

### API Endpoints:
| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/clients` | List & create clients |
| PUT/DELETE | `/api/clients/{id}` | Edit & delete client |
| GET/POST | `/api/trades` | List & create trades |
| PUT/DELETE | `/api/trades/{id}` | Edit & delete trade |
| GET | `/api/prices?symbols=RELIANCE,TCS` | Live NSE prices (Yahoo Finance, free) |
| GET | `/api/stocks/search?q=BEL` | Stock autocomplete (OpenAI GPT-5) |

### `.env` file needs:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_password
OPENAI_API_KEY=sk-proj-...
```

### Key decisions:
- **Yahoo Finance** (`yfinance`) for live NSE prices — free, no key needed
- **OpenAI GPT-5** for stock symbol autocomplete — uses `max_completion_tokens` (not `max_tokens`)
- API key stays server-side, never exposed to browser

---

## Frontend (React + Vite)

**Location:** `portfolio-tracker/src/App.jsx`  
**Start command:**
```bash
cd portfolio-tracker
npm run dev
# Runs on http://localhost:5173
```

### Tabs:
| Tab | Features |
|---|---|
| **Dashboard** | P&L summary cards, performance vs Nifty 50, win rate, alpha |
| **Clients** | Add/Edit/Delete clients (name, phone, email, joining date) |
| **Portfolio** | Active holdings, allocation bars, current value |
| **Trades** | Full trade log, Add/Edit/Delete with FIFO sell validation |
| **Benchmark** | SVG chart — portfolio cumulative return vs Nifty 50 |

### Key changes from original:
- Removed all hardcoded `INIT_TRADES` / `INIT_CMP` data
- All data fetched from PostgreSQL via FastAPI
- Client dropdown in trade form (populated from DB)
- `joining_date` input in client form (user-entered, shown as "Joining Date")
- Notes field on trades
- Stock autocomplete calls backend (API key hidden)
- Live prices call backend (Yahoo Finance)

---

## Pending Issues / Tomorrow's TODO

### 🔴 Bug: Stock Autocomplete Dropdown Not Visible
- **Status:** Backend works (200 OK, GPT-5 returning results)
- **Attempted fixes:** `overflow: visible` on grid, `z-index: 9999`, React Portal with `position: fixed`
- **Still not resolved** — dropdown renders but isn't visible on screen
- **Next step:** Check browser DevTools → Console tab for `Stock search results:` log to confirm data is arriving at the component, then debug from there

### 🟡 UI Upgrade (Planned, Not Started)
Agreed to upgrade UI from 5/10 → 10/10 using:
1. Tailwind CSS + shadcn/ui
2. Recharts for interactive charts
3. Lucide icons
4. Sonner toast notifications (replace `alert()`)
5. Sidebar navigation
6. TanStack Table with sorting/filtering
7. Skeleton loaders
8. Dark mode + Inter font

---

## Quick Reference — How to Start Tomorrow
```bash
# Terminal 1 — Backend
cd portfolio-tracker/backend
source .venv/bin/activate
uvicorn main:app --reload

# Terminal 2 — Frontend
cd portfolio-tracker
npm run dev
```
Then open `http://localhost:5173`
