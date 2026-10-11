import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle, Barcode, Boxes, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, LayoutDashboard, ListFilter,
  BriefcaseBusiness, LogOut, MoreHorizontal, Package, Plus, Printer, Search, Settings, SlidersHorizontal,
  Tags, Trash2, Truck, Users, Warehouse, X,
} from 'lucide-react';
import { api, formatCurrency as currency, getCurrencyDisplay, setCurrencyDisplay, subscribeCurrencyDisplay, type AccessUser, type Category, type Product, type Supplier } from './api';
import { downloadSpreadsheet, readSpreadsheetRows } from './fileFormats';
import FileActionMenu from './FileActionMenu';
import DashboardOverview from './DashboardOverview';
import InventoryDashboard from './InventoryDashboard';
import PurchasesDashboard from './PurchasesDashboard';
import PosDashboard from './PosDashboard';
import ReportsDashboard from './ReportsDashboard';
import CustomersDashboard from './CustomersDashboard';
import SuppliersDashboard from './SuppliersDashboard';
import ExpensesDashboard from './ExpensesDashboard';
import UsersDashboard from './UsersDashboard';
import SettingsDashboard from './SettingsDashboard';
import StaffDashboard from './StaffDashboard';
import NotificationCenter from './NotificationCenter';
import type { NotificationDashboard } from './api';
import HelpCenter from './HelpCenter';
import AccountEntry from './AccountEntry';
import LandingPage from './LandingPage';

type ProductDraft = Omit<Product, 'id' | 'category_name' | 'supplier_name' | 'updated_at' | 'created_at'>;
type StatusFilter = 'All statuses' | 'In stock' | 'Low stock' | 'Out of stock';
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const stockStatus = (product: Product): Exclude<StatusFilter, 'All statuses'> => product.quantity === 0 ? 'Out of stock' : product.quantity <= product.reorder_level ? 'Low stock' : 'In stock';
const adminViews = new Set<NotificationDashboard>(['users', 'settings', 'staff']);
const dashboardViews = new Set<NotificationDashboard>(['overview', 'products', 'inventory', 'purchases', 'pos', 'sales', 'reports', 'customers', 'suppliers', 'expenses', 'users', 'settings', 'staff']);
const isDashboardView = (view: NotificationDashboard | 'home' | 'auth'): view is NotificationDashboard => view !== 'home' && view !== 'auth' && dashboardViews.has(view);

function dashboardLabel(view: NotificationDashboard | 'home' | 'auth') {
  if (view === 'staff') return 'Payroll & Staff';
  if (view === 'users') return 'Users & Roles';
  if (view === 'overview') return 'Dashboard';
  return view.charAt(0).toUpperCase() + view.slice(1);
}

function DashboardPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div style={{ display: active ? 'contents' : 'none' }} aria-hidden={!active}>{children}</div>;
}

function AdminLoginPanel({ section, error, onLogin }: { section: string; error: string; onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError('');
    try { await onLogin(username, password); }
    catch (cause) { setLoginError(cause instanceof Error ? cause.message : 'Administrator sign-in failed.'); }
    finally { setBusy(false); }
  }

  return <div className="access-login-wrap"><form className="access-login-panel" onSubmit={(event) => void submit(event)}><span className="access-login-icon"><BriefcaseBusiness size={22}/></span><span className="access-eyebrow">STOCKPULSE ADMINISTRATION</span><h1>Administrator sign-in</h1><p>Sign in to continue to {section}.</p><label className="catalog-field">Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)}/></label><label className="catalog-field">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>{(loginError || error) && <p className="catalog-form-error">{loginError || error}</p>}<button className="catalog-button catalog-button-primary access-login-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button><small>Administrator accounts are created with Django’s createsuperuser command.</small></form></div>;
}

function ProductForm({ product, categories, suppliers, onClose, onSaved }: {
  product: Product | null; categories: Category[]; suppliers: Supplier[]; onClose: () => void; onSaved: (product: Product) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    name: product?.name ?? '', sku: product?.sku ?? '', category: String(product?.category ?? categories[0]?.id ?? ''),
    supplier: product?.supplier ? String(product.supplier) : '', quantity: String(product?.quantity ?? 0),
    reorder_level: String(product?.reorder_level ?? 10), unit_price: product?.unit_price ?? '0.00',
    cost_price: product?.cost_price ?? '0.00', location: product?.location ?? '',
  });
  const set = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.category) { setError('Add a category before saving a product.'); return; }
    setSaving(true); setError('');
    const payload: ProductDraft = {
      name: draft.name.trim(), sku: draft.sku.trim(), category: Number(draft.category),
      supplier: draft.supplier ? Number(draft.supplier) : null, quantity: Number(draft.quantity),
      reorder_level: Number(draft.reorder_level), unit_price: draft.unit_price,
      cost_price: draft.cost_price, location: draft.location.trim(),
    };
    try {
      const saved = product ? await api.updateProduct(product.id, payload) : await api.createProduct(payload);
      onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this product.'); }
    finally { setSaving(false); }
  }

  return <div className="catalog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="catalog-modal" onSubmit={submit}>
      <div className="catalog-modal-heading"><div><span className="catalog-eyebrow">PRODUCT CATALOG</span><h2>{product ? 'Edit product' : 'Add product'}</h2><p>Keep product, pricing, and stock details up to date.</p></div><button className="catalog-icon-button" type="button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
      <label className="catalog-field">Product name<input required maxLength={180} value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Wireless barcode scanner"/></label>
      <div className="catalog-form-row"><label className="catalog-field">SKU<input required maxLength={64} value={draft.sku} onChange={(event) => set('sku', event.target.value)} placeholder="SKU-1042"/></label><label className="catalog-field">Category<select required value={draft.category} onChange={(event) => set('category', event.target.value)}><option value="">Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
      <label className="catalog-field">Supplier<select value={draft.supplier} onChange={(event) => set('supplier', event.target.value)}><option value="">No supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <div className="catalog-form-row"><label className="catalog-field">On hand<input type="number" min="0" step="1" required value={draft.quantity} onChange={(event) => set('quantity', event.target.value)}/></label><label className="catalog-field">Low-stock threshold<input type="number" min="0" step="1" required value={draft.reorder_level} onChange={(event) => set('reorder_level', event.target.value)}/></label></div>
      <div className="catalog-form-row"><label className="catalog-field">Cost price<input type="number" min="0" step="0.01" required value={draft.cost_price} onChange={(event) => set('cost_price', event.target.value)}/></label><label className="catalog-field">Selling price<input type="number" min="0" step="0.01" required value={draft.unit_price} onChange={(event) => set('unit_price', event.target.value)}/></label></div>
      <label className="catalog-field">Warehouse location<input maxLength={120} value={draft.location} onChange={(event) => set('location', event.target.value)} placeholder="Aisle 2 · Rack 4"/></label>
      {categories.length === 0 && <p className="catalog-form-error">No categories found. Create a category in the inventory API before adding products.</p>}
      {error && <p className="catalog-form-error">{error}</p>}
      <div className="catalog-modal-actions"><button type="button" className="catalog-button catalog-button-light" onClick={onClose}>Cancel</button><button className="catalog-button catalog-button-primary" disabled={saving || categories.length === 0}>{saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button></div>
    </form>
  </div>;
}

export default function ProductCatalog() {
  const currencyDisplay = useSyncExternalStore(subscribeCurrencyDisplay, getCurrencyDisplay, getCurrencyDisplay);
  const [activeView, setActiveViewState] = useState<NotificationDashboard | 'home' | 'auth'>('home');
  const [mountedDashboards, setMountedDashboards] = useState<Set<NotificationDashboard>>(() => new Set());
  const setActiveView = useCallback((view: NotificationDashboard | 'home' | 'auth') => {
    setActiveViewState(view);
    if (isDashboardView(view)) {
      setMountedDashboards((current) => current.has(view) ? current : new Set(current).add(view));
    }
  }, []);
  const [accessUser, setAccessUser] = useState<AccessUser | null>(null);
  const [accessState, setAccessState] = useState<'idle' | 'checking' | 'signedOut' | 'signedIn'>('idle');
  const [accessError, setAccessError] = useState('');
  const [posCustomerId, setPosCustomerId] = useState<number | null>(null);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [supplierFilter, setSupplierFilter] = useState('All suppliers');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All statuses');
  const [sort, setSort] = useState('stock-asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<number[]>([]);
  const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined);
  const [bulkCategory, setBulkCategory] = useState('');
  const [notice, setNotice] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [currencyError, setCurrencyError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accessCheckStarted = useRef(false);

  useEffect(() => {
    void api.exchangeRates().then((data) => {
      setCurrencyDisplay(data.currency, data.rates, data.updated_at);
      setCurrencyError('');
    }).catch((cause) => {
      setCurrencyError(cause instanceof Error ? cause.message : 'Live currency conversion is unavailable; amounts are shown in UGX.');
    });
  }, []);

  useEffect(() => {
    if (currencyDisplay.updatedAt) setCurrencyError('');
  }, [currencyDisplay]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!isDashboardView(activeView) || accessState !== 'idle' || accessCheckStarted.current) return;
    accessCheckStarted.current = true;
    setAccessState('checking');
    setAccessError('');
    void api.accessSession().then(({ user }) => {
      setAccessUser(user);
      setAccessState('signedIn');
    }).catch((cause) => {
      setAccessUser(null);
      setAccessState('signedOut');
      setMountedDashboards(new Set());
      const message = cause instanceof Error ? cause.message : 'Administrator sign-in is required.';
      if (!/administrator sign-in required|authentication credentials/i.test(message)) setAccessError(message);
    });
  }, [activeView, accessState]);

  async function signIn(username: string, password: string) {
    setAccessError('');
    const { user } = await api.accessLogin(username, password);
    setAccessUser(user);
    if (isDashboardView(activeView)) setMountedDashboards((current) => new Set(current).add(activeView));
    setAccessState('signedIn');
  }

  async function signOut() {
    try { await api.accessLogout(); }
    finally { setAccessUser(null); setAccessState('signedOut'); setMountedDashboards(new Set()); }
  }

  const completeAccountSignIn = useCallback((user: AccessUser) => {
    setAccessUser(user);
    setAccessState('signedIn');
    setActiveView('overview');
  }, []);

  async function signOutWorkspace() {
    try { await api.accountLogout(); }
    finally { setAccessUser(null); setAccessState('signedOut'); setMountedDashboards(new Set()); setActiveView('home'); }
  }

  async function signOutCurrentUser() {
    setAccountMenuOpen(false);
    if (isDashboardView(activeView) && adminViews.has(activeView)) await signOut();
    else await signOutWorkspace();
  }

  async function loadData() {
    setLoading(true); setLoadError('');
    try {
      const [productRows, categoryRows, supplierRows] = await Promise.all([api.products(), api.categories(), api.suppliers()]);
      setProducts(productRows); setCategories(categoryRows); setSuppliers(supplierRows); setConnected(true);
    } catch (cause) {
      setConnected(false); setLoadError(cause instanceof Error ? cause.message : 'The inventory API could not be reached.');
    } finally { setLoading(false); }
  }
  useEffect(() => {
    if (activeView === 'overview') void loadData();
  }, [activeView]);
  useEffect(() => { setPage(1); }, [query, categoryFilter, supplierFilter, statusFilter, sort, pageSize]);
  useEffect(() => { setSelected([]); }, [page, pageSize, query, categoryFilter, supplierFilter, statusFilter]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !term || `${product.name} ${product.sku} ${product.category_name} ${product.supplier_name}`.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'All categories' || product.category_name === categoryFilter;
      const matchesSupplier = supplierFilter === 'All suppliers' || product.supplier_name === supplierFilter;
      const matchesStatus = statusFilter === 'All statuses' || stockStatus(product) === statusFilter;
      return matchesQuery && matchesCategory && matchesSupplier && matchesStatus;
    }).sort((a, b) => {
      if (sort === 'stock-desc') return b.quantity - a.quantity || a.name.localeCompare(b.name);
      if (sort === 'name-asc') return a.name.localeCompare(b.name);
      if (sort === 'price-desc') return Number(b.cost_price) - Number(a.cost_price);
      return a.quantity - b.quantity || a.name.localeCompare(b.name);
    });
  }, [products, query, categoryFilter, supplierFilter, statusFilter, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visibleProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const selectedOnPage = visibleProducts.length > 0 && visibleProducts.every((product) => selected.includes(product.id));
  const inStockSkus = products.filter((product) => product.quantity > 0).length;
  const totalCostValue = products.reduce((sum, product) => sum + product.quantity * Number(product.cost_price), 0);
  const lowStockCount = products.filter((product) => product.quantity > 0 && product.quantity <= product.reorder_level).length;
  const depletedCount = products.filter((product) => product.quantity === 0).length;

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3000); }
  function togglePageSelection() {
    setSelected((current) => selectedOnPage ? current.filter((id) => !visibleProducts.some((product) => product.id === id)) : [...new Set([...current, ...visibleProducts.map((product) => product.id)])]);
  }
  function productExportRows(): unknown[][] {
    return [['SKU', 'Product', 'Category', 'Supplier', 'Quantity', 'Reorder level', 'Cost price', 'Unit price', 'Location'], ...filteredProducts.map((product) => [product.sku, product.name, product.category_name, product.supplier_name, product.quantity, product.reorder_level, product.cost_price, product.unit_price, product.location])];
  }
  function exportCsv() {
    const rows = productExportRows();
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'stockpulse-products.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  async function exportXlsx() {
    try { await downloadSpreadsheet('stockpulse-products.xlsx', 'Products', productExportRows()); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Excel export failed.'); }
  }
  function printLabels(rows: Product[]) {
    if (!rows.length) { notify('Select at least one product to print labels.'); return; }
    const popup = window.open('', '_blank', 'width=780,height=620');
    if (!popup) { notify('Allow pop-ups to print product labels.'); return; }
    const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
    popup.document.write(`<!doctype html><html><head><title>Product labels</title><style>body{font:14px Arial,sans-serif;padding:24px}.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.label{border:1px solid #ccd4e0;border-radius:8px;padding:15px;min-height:94px}.name{font-weight:700;margin-bottom:8px}.sku{font-family:monospace;color:#334155}.bars{height:28px;margin-top:9px;background:repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 4px,#111 4px 5px,transparent 5px 8px)}@media print{body{padding:0}.label{break-inside:avoid}}</style></head><body><div class="labels">${rows.map((product) => `<div class="label"><div class="name">${escapeHtml(product.name)}</div><div class="sku">${escapeHtml(product.sku)}</div><div class="bars"></div></div>`).join('')}</div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }
  async function updateSelectedCategory() {
    if (!bulkCategory || selected.length === 0) return;
    try {
      await Promise.all(selected.map((id) => api.updateProduct(id, { category: Number(bulkCategory) })));
      await loadData(); setSelected([]); setBulkCategory(''); notify('Category updated for selected products.');
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not update selected products.'); }
  }
  async function deleteSelected() {
    if (!selected.length || !window.confirm(`Permanently delete ${selected.length} selected product${selected.length === 1 ? '' : 's'}?`)) return;
    try { await Promise.all(selected.map((id) => api.deleteProduct(id))); await loadData(); setSelected([]); notify('Selected products deleted.'); }
    catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not delete selected products.'); }
  }
  async function importProducts(file?: File) {
    if (!file) return;
    let imported = 0;
    try {
      const rows = await readSpreadsheetRows(file);
      if (rows.length < 2) { notify('The file has no product rows.'); return; }
      const headers = rows[0].map((value) => value.trim().toLowerCase());
      const index = (key: string) => headers.indexOf(key);
      for (const values of rows.slice(1)) {
        const category = categories.find((item) => item.name.toLowerCase() === values[index('category')]?.toLowerCase());
        if (!category || !values[index('sku')] || !values[index('product')]) continue;
        const supplier = suppliers.find((item) => item.name.toLowerCase() === values[index('supplier')]?.toLowerCase());
        await api.createProduct({ sku: values[index('sku')], name: values[index('product')], category: category.id, supplier: supplier?.id ?? null, quantity: Number(values[index('quantity')] || 0), reorder_level: Number(values[index('reorder level')] || 0), cost_price: values[index('cost price')] || '0', unit_price: values[index('unit price')] || '0', location: values[index('location')] || '' });
        imported += 1;
      }
      await loadData(); notify(`${imported} product${imported === 1 ? '' : 's'} imported. Rows with unknown categories were skipped.`);
    } catch (cause) { notify(cause instanceof Error ? `Import stopped: ${cause.message}` : 'Import failed.'); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }
  function chooseProductImport(accept: string) {
    if (!importRef.current) return;
    importRef.current.accept = accept;
    importRef.current.click();
  }

  if (activeView === 'home') return <LandingPage onOpenDashboard={() => setActiveView('auth')}/>;
  if (activeView === 'auth') return <AccountEntry onBack={() => setActiveView('home')} onAuthenticated={completeAccountSignIn}/>;

  return <div className="catalog-shell">
    <aside className="catalog-sidebar">
      <div className="catalog-brand"><span className="catalog-brand-mark"><Package size={17}/></span><span><strong>StockPulse</strong><small>ERP SUITE</small></span></div>
      <nav className="catalog-nav" aria-label="Main navigation">
        <button className={`catalog-nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')}><LayoutDashboard size={15}/>Dashboard</button>
        <button className={`catalog-nav-item ${activeView === 'products' ? 'active' : ''}`} onClick={() => setActiveView('products')}><Package size={15}/>Products</button>
        <button className={`catalog-nav-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => setActiveView('inventory')}><Warehouse size={15}/>Inventory</button>
        <button className={`catalog-nav-item ${activeView === 'purchases' ? 'active' : ''}`} onClick={() => setActiveView('purchases')}><Truck size={15}/>Purchases</button>
        <button className={`catalog-nav-item ${activeView === 'pos' ? 'active' : ''}`} onClick={() => setActiveView('pos')}><Boxes size={15}/>Point of Sale<span className="catalog-fast">FAST</span></button>
        <button className={`catalog-nav-item ${activeView === 'sales' ? 'active' : ''}`} onClick={() => setActiveView('sales')}><Tags size={15}/>Sales</button>
        <button className={`catalog-nav-item ${activeView === 'customers' ? 'active' : ''}`} onClick={() => setActiveView('customers')}><Users size={15}/>Customers</button>
        <button className={`catalog-nav-item ${activeView === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveView('suppliers')}><Truck size={15}/>Suppliers</button>
        <button className={`catalog-nav-item ${activeView === 'expenses' ? 'active' : ''}`} onClick={() => setActiveView('expenses')}><ListFilter size={15}/>Expenses</button>
        <button className={`catalog-nav-item ${activeView === 'reports' ? 'active' : ''}`} onClick={() => setActiveView('reports')}><Boxes size={15}/>Reports</button>
        <div className="catalog-nav-divider"/>
        <button className={`catalog-nav-item ${activeView === 'staff' ? 'active' : ''}`} onClick={() => setActiveView('staff')}><BriefcaseBusiness size={15}/>Payroll &amp; Staff</button>
        <button className={`catalog-nav-item ${activeView === 'users' ? 'active' : ''}`} onClick={() => setActiveView('users')}><Users size={15}/>Users &amp; Roles</button>
        <button className={`catalog-nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}><Settings size={15}/>Settings</button>
        <button className="catalog-nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={15}/>Help Center</button>
      </nav>
      <div className="catalog-sidebar-status"><i/>{connected ? 'Cloud Sync: Live' : 'Connecting to API'}<span>v1.0</span></div>
    </aside>
    <main className="catalog-main">
      <header className="catalog-topbar"><div className="catalog-business"><span>BUSINESS UNIT</span><strong>Apex Supply Co. - Main Warehouse <ChevronDown size={13}/></strong></div><div className="catalog-top-actions">{activeView === 'products' && <><label className="catalog-search global-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, SKUs, invoices"/><kbd>⌘ K</kbd></label><button className="catalog-button catalog-button-primary" onClick={() => setModalProduct(null)}><Plus size={15}/>New<ChevronDown size={12}/></button></>}<NotificationCenter onNavigate={setActiveView}/><button className="catalog-icon-button" aria-label="Help Center" title="Help Center" onClick={() => setHelpOpen(true)}><CircleHelp size={17}/></button><div className="catalog-account" ref={accountMenuRef}><button className="catalog-account-trigger" type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-controls="catalog-account-menu" onClick={() => setAccountMenuOpen((open) => !open)}><span className="catalog-user-avatar">{accessUser ? (accessUser.first_name || accessUser.username).slice(0, 2).toUpperCase() : '—'}</span><span className="catalog-user-name">{accessUser ? accessUser.display_name || accessUser.username : 'Not signed in'}<small>{accessUser?.is_superuser || accessUser?.is_staff ? 'Administrator' : accessUser ? 'Workspace member' : 'Sign in to continue'}</small></span><ChevronDown className={accountMenuOpen ? 'is-open' : ''} size={13}/></button>{accountMenuOpen && <div className="catalog-account-menu" id="catalog-account-menu" role="menu" aria-label="Account menu">{accessUser ? <><div className="catalog-account-details"><strong>{accessUser.display_name || `${accessUser.first_name} ${accessUser.last_name}`.trim() || accessUser.username}</strong><span>{accessUser.email || accessUser.username}</span></div><button className="catalog-account-action" type="button" role="menuitem" onClick={() => void signOutCurrentUser()}><LogOut size={14}/>Sign out</button></> : <div className="catalog-account-details"><strong>No user signed in</strong><span>Sign in to access account options.</span></div>}</div>}</div></div></header>
      {currencyError && <div className="currency-rate-warning" role="status">{currencyError} Values remain stored in Ugandan shillings.</div>}
      {dashboardViews.has(activeView) && activeView !== 'staff' && accessState !== 'signedIn'
        ? accessState === 'checking' || accessState === 'idle'
          ? <section className="overview-state">Checking administrator session…</section>
          : <AdminLoginPanel section={dashboardLabel(activeView)} error={accessError} onLogin={signIn}/>
        : <div>
      {mountedDashboards.has('staff') && <DashboardPanel active={activeView === 'staff'}><StaffDashboard onNavigate={setActiveView} onSignOut={signOut}/></DashboardPanel>}
      {mountedDashboards.has('settings') && <DashboardPanel active={activeView === 'settings'}><SettingsDashboard onNavigate={setActiveView} onSignOut={signOut}/></DashboardPanel>}
      {mountedDashboards.has('overview') && <DashboardPanel active={activeView === 'overview'}><DashboardOverview onOpenProducts={() => setActiveView('products')} onOpenInventory={() => setActiveView('inventory')} onOpenPurchases={() => setActiveView('purchases')} onOpenPOS={() => setActiveView('pos')} onOpenReports={() => setActiveView('reports')} onOpenExpenses={() => setActiveView('expenses')}/></DashboardPanel>}
      {mountedDashboards.has('inventory') && <DashboardPanel active={activeView === 'inventory'}><InventoryDashboard onOpenProducts={() => setActiveView('products')} onOpenPurchases={() => setActiveView('purchases')} onInventoryChanged={loadData}/></DashboardPanel>}
      {mountedDashboards.has('purchases') && <DashboardPanel active={activeView === 'purchases'}><PurchasesDashboard initialSupplierId={purchaseSupplierId} onInitialSupplierUsed={() => setPurchaseSupplierId(null)} onOpenInventory={() => setActiveView('inventory')} onOpenProducts={() => setActiveView('products')}/></DashboardPanel>}
      {mountedDashboards.has('pos') && <DashboardPanel active={activeView === 'pos'}><PosDashboard initialCustomerId={posCustomerId} onOpenProducts={() => setActiveView('products')} onOpenInventory={() => setActiveView('inventory')} onSaleCompleted={loadData}/></DashboardPanel>}
      {mountedDashboards.has('customers') && <DashboardPanel active={activeView === 'customers'}><CustomersDashboard onStartSale={(customerId) => { setPosCustomerId(customerId); setActiveView('pos'); }} onOpenSales={() => setActiveView('sales')}/></DashboardPanel>}
      {mountedDashboards.has('suppliers') && <DashboardPanel active={activeView === 'suppliers'}><SuppliersDashboard onOpenPurchases={(supplierId) => { setPurchaseSupplierId(supplierId); setActiveView('purchases'); }} onOpenInventory={() => setActiveView('inventory')}/></DashboardPanel>}
      {mountedDashboards.has('expenses') && <DashboardPanel active={activeView === 'expenses'}><ExpensesDashboard onOpenReports={() => setActiveView('reports')}/></DashboardPanel>}
      {mountedDashboards.has('users') && <DashboardPanel active={activeView === 'users'}><UsersDashboard onSignOut={signOut}/></DashboardPanel>}
      {(mountedDashboards.has('reports') || mountedDashboards.has('sales')) && <DashboardPanel active={activeView === 'reports' || activeView === 'sales'}><ReportsDashboard onOpenInventory={() => setActiveView('inventory')} onOpenPurchases={() => setActiveView('purchases')} onOpenPOS={() => setActiveView('pos')} onOpenExpenses={() => setActiveView('expenses')}/></DashboardPanel>}
      {mountedDashboards.has('products') && <DashboardPanel active={activeView === 'products'}><>
      <section className="catalog-heading"><div><div className="catalog-breadcrumb">Inventory <span>›</span> <b>Products Catalog</b></div><h1>Products Catalog</h1><p>Manage all product catalogs, pricing, SKU attributes, and supplier procurement links.</p></div><div className="catalog-heading-actions"><button className="catalog-button catalog-button-light" onClick={() => printLabels(products.filter((product) => selected.includes(product.id)))}><Printer size={14}/>Print Barcodes</button><FileActionMenu label="Import" direction="import" options={[{ label: 'CSV file', onSelect: () => chooseProductImport('.csv,text/csv') }, { label: 'Excel workbook', onSelect: () => chooseProductImport('.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel') }]}/><input ref={importRef} className="catalog-hidden" type="file" onChange={(event) => void importProducts(event.target.files?.[0])}/><FileActionMenu label="Export" direction="export" options={[{ label: 'CSV file', onSelect: exportCsv }, { label: 'Excel workbook', onSelect: () => void exportXlsx() }]}/><button className="catalog-button catalog-button-primary" onClick={() => setModalProduct(null)}><Plus size={15}/>Add Product</button></div></section>
      <section className="catalog-metrics" aria-label="Product catalog metrics">
        <article className="catalog-metric"><span>CATALOG ASSET VALUE</span><strong>{currency(totalCostValue)}</strong><small className="metric-positive"><Check size={12}/> At cost across all products</small><i className="metric-icon blue"><Barcode size={16}/></i></article>
        <article className="catalog-metric"><span>IN STOCK SKUS</span><strong>{inStockSkus.toLocaleString()}</strong><small className="metric-positive"><Check size={12}/> {products.length.toLocaleString()} active catalog items</small><i className="metric-icon green"><Check size={16}/></i></article>
        <article className="catalog-metric"><span>LOW STOCK THRESHOLD</span><strong>{lowStockCount.toLocaleString()}</strong><small><AlertTriangle size={12}/> Action required</small><i className="metric-icon indigo"><AlertTriangle size={16}/></i></article>
        <article className="catalog-metric depleted"><span>DEPLETED / STOCKOUT</span><strong>{depletedCount.toLocaleString()}</strong><small><i/> Stock unavailable</small><i className="metric-icon red"><X size={16}/></i></article>
      </section>
      <section className="catalog-filter-panel">
        <div className="catalog-filter-row"><label className="catalog-search product-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by product name, SKU, barcode"/><kbd>/</kbd></label>
          <label className="catalog-select"><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category.id}>{category.name}</option>)}</select><ChevronDown size={13}/></label>
          <label className="catalog-select"><select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}><option>All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select><ChevronDown size={13}/></label>
          <label className="catalog-select"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option>All statuses</option><option>In stock</option><option>Low stock</option><option>Out of stock</option></select><ChevronDown size={13}/></label>
        </div>
        <div className="catalog-filter-bottom"><label className="catalog-sort"><SlidersHorizontal size={13}/><span>Sort:</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="stock-asc">Stock (Low to High)</option><option value="stock-desc">Stock (High to Low)</option><option value="name-asc">Product name (A to Z)</option><option value="price-desc">Cost (High to Low)</option></select><ChevronDown size={12}/></label><button className="catalog-clear" onClick={() => { setCategoryFilter('All categories'); setSupplierFilter('All suppliers'); setStatusFilter('All statuses'); setSort('stock-asc'); setQuery(''); }}>Clear filters</button></div>
      </section>
      {selected.length > 0 && <section className="catalog-bulk-bar"><span className="catalog-selected-dot"/>{selected.length} {selected.length === 1 ? 'item' : 'items'} selected <span className="catalog-bulk-sku">{products.find((product) => product.id === selected[0])?.sku}</span><div className="catalog-bulk-actions"><label className="catalog-bulk-select"><select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}><option value="">Update Category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><ChevronDown size={12}/></label><button onClick={() => void updateSelectedCategory()} disabled={!bulkCategory}><Tags size={13}/>Apply</button><button onClick={() => printLabels(products.filter((product) => selected.includes(product.id)))}><Printer size={13}/>Print Labels</button><button className="danger" onClick={() => void deleteSelected()}><Trash2 size={13}/>Delete</button><button className="catalog-clear" onClick={() => setSelected([])}>Deselect All</button></div></section>}
      <section className="catalog-table-panel">
        <div className="catalog-table-scroll"><table className="catalog-table"><thead><tr><th className="catalog-check-cell"><input type="checkbox" aria-label="Select current page" checked={selectedOnPage} onChange={togglePageSelection}/></th><th>PRODUCT / CATEGORY</th><th>SKU &amp; BARCODE</th><th>CATEGORY</th><th>SUPPLIER</th><th>COST PRICE</th><th>ON HAND</th><th>STATUS</th><th aria-label="Actions"/></tr></thead><tbody>
          {loading && <tr><td colSpan={9} className="catalog-state">Loading products from inventory API…</td></tr>}
          {!loading && loadError && <tr><td colSpan={9} className="catalog-state catalog-error-state"><strong>Could not connect to inventory</strong><span>{loadError}</span><button className="catalog-button catalog-button-light" onClick={() => void loadData()}>Retry connection</button></td></tr>}
          {!loading && !loadError && visibleProducts.map((product) => {
            const status = stockStatus(product);
            return <tr key={product.id}><td className="catalog-check-cell"><input type="checkbox" aria-label={`Select ${product.name}`} checked={selected.includes(product.id)} onChange={() => setSelected((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}/></td><td><div className="catalog-product-cell"><span className="catalog-product-thumb"><Package size={17}/></span><span><strong>{product.name}</strong><small>{product.category_name || 'Uncategorized'}</small></span></div></td><td><span className="catalog-sku">{product.sku}</span><small className="catalog-barcode"><Barcode size={12}/>{product.sku.replace(/\D/g, '').slice(0, 12) || product.sku}</small></td><td><span className="catalog-category-chip">{product.category_name}</span></td><td>{product.supplier_name || <span className="catalog-muted">—</span>}</td><td>{currency(product.cost_price)}</td><td><strong className={`catalog-quantity ${status === 'Out of stock' ? 'is-out' : status === 'Low stock' ? 'is-low' : ''}`}>{product.quantity.toLocaleString()}</strong><small className="catalog-reorder">Min. {product.reorder_level}</small></td><td><span className={`catalog-status ${status.toLowerCase().replace(/ /g, '-')}`}>{status}</span></td><td><button className="catalog-row-action" aria-label={`Edit ${product.name}`} onClick={() => setModalProduct(product)}><MoreHorizontal size={17}/></button></td></tr>;
          })}
          {!loading && !loadError && visibleProducts.length === 0 && <tr><td colSpan={9} className="catalog-state">No products match these filters. Try a different search or add a product.</td></tr>}
        </tbody></table></div>
        <footer className="catalog-table-footer"><span>Showing <b>{filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredProducts.length)}</b> of <b>{filteredProducts.length.toLocaleString()}</b> products</span><label>Rows per page:<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div className="catalog-pagination"><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15}/></button><span>Page {page} of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={15}/></button></div></footer>
      </section>
      </></DashboardPanel>}
        </div>}
      <footer className="catalog-page-footer"><span>© 2026 StockPulse Operations</span><span><i/> Inventory data synced from Django</span></footer>
    </main>
    {notice && <div className="catalog-toast"><Check size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {modalProduct !== undefined && <ProductForm key={modalProduct?.id ?? 'new'} product={modalProduct} categories={categories} suppliers={suppliers} onClose={() => setModalProduct(undefined)} onSaved={async () => { setModalProduct(undefined); await loadData(); notify('Product saved to inventory.'); }}/ >}
    {helpOpen && <HelpCenter onClose={() => setHelpOpen(false)} onNavigate={(view) => { setActiveView(view); setHelpOpen(false); }}/ >}
  </div>;
}
