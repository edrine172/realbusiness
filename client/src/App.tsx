import { lazy, Suspense } from 'react';
import ProductCatalog from './ProductCatalog';

const AdminGovernanceDashboard = lazy(() => import('./AdminGovernanceDashboard'));

export default function App() {
  return window.location.pathname.replace(/\/+$/, '') === '/admin'
    ? <Suspense fallback={<section className="overview-state" role="status">Loading administration portal…</section>}><AdminGovernanceDashboard/></Suspense>
    : <ProductCatalog/>;
}
