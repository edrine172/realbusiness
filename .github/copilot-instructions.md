# StockMaster workspace guidance

- Frontend lives in `frontend/` and uses React, strict TypeScript, Vite, and lucide-react.
- Backend lives in `backend/` and uses Django REST Framework with SQLite for local development.
- Keep frontend API requests under `frontend/src/api.ts`; the API base URL is configured by `VITE_API_BASE_URL`.
- Inventory domain models and REST endpoints belong to the Django `inventory` app.
- Use `python manage.py check` for Django validation and `npm run build` for frontend validation.
- The dashboard should remain responsive and visually consistent with the StockMaster inventory reference.
