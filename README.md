# StockMaster Inventory

A full-stack inventory management dashboard built with React, TypeScript, Vite, Django, and Django REST Framework.

## Requirements

- Node.js 18+
- Python 3.10+

## Start the Django API

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
py manage.py migrate
py manage.py seed_demo
py manage.py runserver
```

The API is available at `http://127.0.0.1:8000/api/`. The demo seed command creates sample categories, suppliers, products, and inventory activity; it is safe to rerun.

## Start the React dashboard

In a second terminal:

```powershell
npm install --prefix frontend
npm start
```

Open the local URL printed by Vite. The frontend uses `VITE_API_BASE_URL` (default `http://127.0.0.1:8000/api`) to connect to Django. Copy `frontend/.env.example` to `frontend/.env.local` to override it.

The root `npm start` command forwards to the frontend Vite server, so it works from the project root. Start the Django API separately using the backend steps above.

## API routes

- `GET/POST /api/products/`
- `GET/PUT/PATCH/DELETE /api/products/{id}/`
- `GET/POST /api/categories/`
- `GET/POST /api/suppliers/`
- `GET/POST /api/movements/`
- `GET /api/dashboard/summary/`

The development database is SQLite. Django admin is available at `/admin/` after creating a superuser with `py manage.py createsuperuser`.
