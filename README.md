# StockMaster Inventory

A full-stack inventory management dashboard built with React, TypeScript, Vite, Django, and Django REST Framework.

## Requirements

- Node.js 18+
- Python 3.10+

## Start the Django API

```powershell
cd server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
py manage.py migrate
py manage.py seed_demo
py manage.py runserver
```

Set the PostgreSQL connection values in `server/.env` before starting the API; the PostgreSQL service must be installed and running, and the database role must have access to the named database. The `.env` file is local-only and is ignored by Git. `DATABASE_ENGINE=postgresql` enables PostgreSQL, while `DATABASE_ENGINE=sqlite` selects the local SQLite file; if `DATABASE_ENGINE` is omitted, Django uses PostgreSQL when `POSTGRES_DB` is set and otherwise uses SQLite. PostgreSQL configuration requires `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The API is available at `http://127.0.0.1:8000/api/`. The demo seed command creates sample categories, suppliers, products, and inventory activity; it is safe to rerun.

## Start the React dashboard

In a second terminal:

```powershell
npm install --prefix client
npm start --prefix client
```

Open the local URL printed by Vite. The frontend uses `VITE_API_BASE_URL` (default `http://127.0.0.1:8000/api`) to connect to Django. Copy `client/.env.example` to `client/.env.local` to override it.

The root `npm start` command also forwards to the client Vite server. Start the Django API separately using the server steps above.

## API routes

- `GET/POST /api/products/`
- `GET/PUT/PATCH/DELETE /api/products/{id}/`
- `GET/POST /api/categories/`
- `GET/POST /api/suppliers/`
- `GET/POST /api/movements/`
- `GET /api/dashboard/summary/`

The development database is SQLite. Django admin is available at `/admin/` after creating a superuser with `py manage.py createsuperuser`.
