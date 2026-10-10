import { useEffect, useState } from 'react';
import { Boxes, BriefcaseBusiness, ChartNoAxesCombined, Package, RefreshCw, ShoppingCart, TrendingUp, Truck } from 'lucide-react';
import { api, formatCurrency as currency, getCurrencyDisplay, type ReportsSummary } from './api';
import FileActionMenu from './FileActionMenu';

type ReportTab = 'sales' | 'inventory' | 'purchases' | 'financial';
type DateRange = '1d' | '7d' | '30d' | '90d' | '180d' | '365d' | '730d' | '1825d' | '3650d' | '18250d' | '36500d' | '73000d';
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const reportTabs: Array<{ value: ReportTab; label: string; icon: typeof ChartNoAxesCombined }> = [
  { value: 'sales', label: 'Sales reports', icon: ChartNoAxesCombined },
  { value: 'inventory', label: 'Inventory reports', icon: Package },
  { value: 'purchases', label: 'Purchases reports', icon: ShoppingCart },
  { value: 'financial', label: 'Financial & P&L', icon: BriefcaseBusiness },
];
const palette = ['#2865e9', '#43bd8b', '#e6a23c', '#e4675e', '#7888b8', '#2f9eaf'];

export default function ReportsDashboard({ onOpenInventory, onOpenPurchases, onOpenPOS, onOpenExpenses }: {
  onOpenInventory: () => void;
  onOpenPurchases: () => void;
  onOpenPOS: () => void;
  onOpenExpenses: () => void;
}) {
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [range, setRange] = useState<DateRange>('30d');
  const [monthMode, setMonthMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadReport(selectedRange: DateRange = range, month?: string) {
    setLoading(true);
    setError('');
    try {
      setReport(await api.reportsSummary(selectedRange, month));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReport(range, monthMode ? selectedMonth : undefined); }, [range, monthMode, selectedMonth]);

  const series = report?.daily_series ?? [];
  const chartSeries = (() => {
    if (!report) return [];
    if (report.series_interval !== 'day') return series;
    const groups = new Map<string, { label: string; revenue: number; gross_profit: number; purchases: number; expenses: number }>();
    series.forEach((day, index) => {
      const date = new Date(`${report.start_date}T00:00:00`);
      date.setDate(date.getDate() + index);
      const monthly = !monthMode && range === '365d';
      const weekly = !monthMode && (range === '90d' || range === '180d');
      const key = monthly ? `${date.getFullYear()}-${date.getMonth()}` : weekly ? String(Math.floor(index / 7)) : String(index);
      const label = monthly ? new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date) : day.label;
      const existing = groups.get(key);
      if (existing) {
        existing.revenue += day.revenue;
        existing.gross_profit += day.gross_profit;
        existing.purchases += day.purchases;
        existing.expenses += day.expenses;
      } else {
        groups.set(key, { label, revenue: day.revenue, gross_profit: day.gross_profit, purchases: day.purchases, expenses: day.expenses });
      }
    });
    return [...groups.values()];
  })();
  const labelIndexes = new Set([0, Math.floor((chartSeries.length - 1) / 2), chartSeries.length - 1]);
  const categories = activeTab === 'inventory' ? report?.inventory_categories ?? [] : activeTab === 'purchases' ? report?.purchase_categories ?? [] : report?.categories ?? [];
  const chartData = activeTab === 'inventory'
    ? categories.map((category) => ({ label: category.name, primary: Number(category.revenue), secondary: 0, tertiary: 0, quaternary: 0 }))
    : chartSeries.map((day) => ({ label: day.label, primary: activeTab === 'purchases' ? day.purchases : day.revenue, secondary: activeTab === 'financial' || activeTab === 'sales' ? day.gross_profit : 0, tertiary: activeTab === 'financial' ? day.purchases : 0, quaternary: activeTab === 'financial' ? day.expenses : 0 }));
  const maxValue = Math.max(...chartData.flatMap((day) => [day.primary, day.secondary, day.tertiary, day.quaternary ?? 0]), 1);
  const categoryTotal = categories.reduce((sum, category) => sum + category.percent, 0);
  let accumulatedPercent = 0;
  const donutGradient = categories.length ? `conic-gradient(${categories.map((category, index) => {
    const start = accumulatedPercent;
    accumulatedPercent += category.percent;
    return `${palette[index % palette.length]} ${start}% ${accumulatedPercent}%`;
  }).join(', ')})` : '#e7edf5';

  const metricCards = report ? activeTab === 'inventory' ? [
    { label: 'INVENTORY VALUE', value: currency(report.inventory_value), detail: 'Valued at current cost', icon: Boxes, tone: 'blue' },
    { label: 'UNITS ON HAND', value: report.inventory_units.toLocaleString(), detail: `${report.total_skus} active SKUs`, icon: Package, tone: 'green' },
    { label: 'STOCK ALERTS', value: (report.low_stock_count + report.out_of_stock_count).toLocaleString(), detail: `${report.out_of_stock_count} out of stock`, icon: TrendingUp, tone: 'amber' },
    { label: 'INVENTORY TURNOVER', value: `${report.inventory_turnover}×`, detail: 'Annualized at cost', icon: RefreshCw, tone: 'mint' },
  ] : activeTab === 'purchases' ? [
    { label: 'RECEIVED SPEND', value: currency(report.purchase_spend), detail: 'In selected period', icon: Truck, tone: 'blue' },
    { label: 'ORDERS RECEIVED', value: report.received_orders.toLocaleString(), detail: 'Completed supplier orders', icon: ShoppingCart, tone: 'green' },
    { label: 'OPEN ORDERS', value: report.open_orders.toLocaleString(), detail: `${currency(report.open_purchase_value)} committed`, icon: BriefcaseBusiness, tone: 'amber' },
    { label: 'PURCHASE CATEGORIES', value: categories.length.toLocaleString(), detail: 'With received units', icon: Boxes, tone: 'mint' },
  ] : [
    { label: 'NET REVENUE', value: currency(report.revenue), detail: `${report.revenue_change_percent >= 0 ? '+' : ''}${report.revenue_change_percent}% vs previous period`, icon: ChartNoAxesCombined, tone: 'blue' },
    { label: 'COST OF GOODS', value: currency(report.cost_of_goods), detail: 'Cost snapshots at checkout', icon: ShoppingCart, tone: 'slate' },
    { label: 'GROSS PROFIT', value: currency(report.gross_profit), detail: `${report.gross_margin}% gross margin`, icon: TrendingUp, tone: 'green' },
    { label: activeTab === 'financial' ? 'NET PROFIT' : 'INVENTORY TURNOVER', value: activeTab === 'financial' ? currency(report.net_profit) : `${report.inventory_turnover}×`, detail: activeTab === 'financial' ? `${currency(report.operating_expenses)} operating expenses` : 'Annualized at cost', icon: activeTab === 'financial' ? BriefcaseBusiness : RefreshCw, tone: 'mint' },
  ] : [];

  function exportReport() {
    if (!report) return;
    const rows = activeTab === 'inventory'
      ? [['Category', 'Units on hand', 'Inventory value', 'Mix %'], ...report.inventory_categories.map((category) => [category.name, category.units, category.revenue, `${category.percent}%`])]
      : activeTab === 'purchases'
        ? [['Category', 'Units received', 'Purchase spend', 'Mix %'], ...report.purchase_categories.map((category) => [category.name, category.units, category.revenue, `${category.percent}%`])]
        : [['Product', 'SKU', 'Category', 'Units sold', 'Revenue', 'Cost', 'Gross profit', 'Gross margin', 'Average price'], ...report.top_products.map((product) => [product.product_name, product.product_sku, product.category_name, product.units_sold, product.revenue, product.cost, product.gross_profit, `${product.gross_margin}%`, product.average_price])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `stockpulse-report-${monthMode ? selectedMonth : range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportReportPdf() {
    if (!report) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const title = reportTabs.find((tab) => tab.value === activeTab)?.label ?? 'Business report';
    const headings = activeTab === 'inventory'
      ? ['Category', 'Units on hand', 'Inventory value', 'Mix %']
      : activeTab === 'purchases'
        ? ['Category', 'Units received', 'Purchase spend', 'Mix %']
        : ['Product', 'SKU', 'Category', 'Units sold', 'Revenue', 'Cost', 'Gross profit', 'Gross margin', 'Average price'];
    const body = activeTab === 'inventory'
      ? report.inventory_categories.map((category) => [category.name, category.units.toLocaleString(), currency(category.revenue), `${category.percent}%`])
      : activeTab === 'purchases'
        ? report.purchase_categories.map((category) => [category.name, category.units.toLocaleString(), currency(category.revenue), `${category.percent}%`])
        : report.top_products.map((product) => [product.product_name, product.product_sku, product.category_name, product.units_sold.toLocaleString(), currency(product.revenue), currency(product.cost), currency(product.gross_profit), `${product.gross_margin}%`, currency(product.average_price)]);
    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    document.setFontSize(17);
    document.text(`StockPulse · ${title}`, 36, 40);
    document.setFontSize(9);
    document.text(`${dateLabel(report.start_date)} - ${dateLabel(report.end_date)} · Amounts in ${getCurrencyDisplay().currency}`, 36, 58);
    autoTable(document, {
      head: [headings],
      body,
      startY: 76,
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [40, 101, 233] },
      margin: { left: 36, right: 36 },
    });
    document.save(`stockpulse-${activeTab}-report-${monthMode ? selectedMonth : range}.pdf`);
  }

  return <>
    <section className="catalog-heading reports-heading"><div><div className="catalog-breadcrumb">Analytics <span>›</span> <b>Business reports</b></div><h1>Analytics &amp; Business Reports</h1><p>Track revenue, margin, stock value, and supplier spend across your operation.</p></div><div className="reports-heading-actions"><span className="reports-live"><i/>Live</span><div className="overview-flow-controls"><label className="catalog-select reports-range"><select aria-label="Report history range" value={monthMode ? 'month' : range} onChange={(event) => { if (event.target.value === 'month') setMonthMode(true); else { setMonthMode(false); setRange(event.target.value as DateRange); } }}><optgroup label="Rolling history"><option value="1d">Last day</option><option value="7d">Last week</option><option value="30d">Last month</option><option value="90d">Last 3 months</option><option value="180d">Last 6 months</option><option value="365d">Last year</option><option value="730d">Last 2 years</option><option value="1825d">Last 5 years</option><option value="3650d">Last 10 years</option><option value="18250d">Last 50 years</option><option value="36500d">Last 100 years</option><option value="73000d">Last 200 years</option></optgroup><option value="month">Choose month &amp; year</option></select></label>{monthMode && <input className="overview-flow-month-picker" type="month" aria-label="Select report month and year" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}/>}</div><FileActionMenu label="Export" direction="export" options={[{ label: 'CSV report', onSelect: exportReport, disabled: !report }, { label: 'PDF report', onSelect: () => void exportReportPdf().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'PDF export failed.')), disabled: !report }]}/></div></section>
    <div className="reports-tabs" role="tablist" aria-label="Report types">{reportTabs.map(({ value, label, icon: Icon }) => <button key={value} role="tab" aria-selected={activeTab === value} className={activeTab === value ? 'active' : ''} onClick={() => setActiveTab(value)}><Icon size={14}/>{label}</button>)}</div>
    <div className="reports-filter-row"><span>{report ? `${dateLabel(report.start_date)} – ${dateLabel(report.end_date)}` : 'Selected period'}</span><div><span>VIEW:</span><button className="active">By category</button><button onClick={onOpenInventory}>Inventory</button>{activeTab === 'financial' && <button onClick={onOpenExpenses}>Expenses</button>}</div></div>
    {loading && <section className="overview-state">Loading reports from the API…</section>}
    {!loading && error && <section className="overview-state overview-error"><strong>Could not load reports</strong><span>{error}</span><button className="catalog-button catalog-button-light" onClick={() => void loadReport(range, monthMode ? selectedMonth : undefined)}><RefreshCw size={14}/>Retry</button></section>}
    {!loading && report && <>
      <section className="reports-metrics" aria-label="Report metrics">{metricCards.map(({ label, value, detail, icon: Icon, tone }) => <article className={`reports-metric ${tone}`} key={label}><div><span>{label}</span><Icon size={15}/></div><strong>{value}</strong><small>{detail}</small></article>)}</section>
      <div className="reports-analysis-grid">
        <section className="overview-panel reports-chart-panel"><div className="overview-panel-heading"><div><span>{activeTab === 'inventory' ? 'STOCK HEALTH' : activeTab === 'purchases' ? 'SUPPLIER ACTIVITY' : 'PERFORMANCE'}</span><h2>{activeTab === 'inventory' ? 'Inventory value by category' : activeTab === 'purchases' ? 'Purchase spend trend' : activeTab === 'financial' ? 'Gross profit & revenue trend' : 'Revenue & gross profit trend'}</h2></div><span className="overview-period">{monthMode ? 'Daily totals' : report.series_interval === 'year' ? 'Yearly totals' : report.series_interval === 'month' || range === '365d' ? 'Monthly totals' : range === '90d' || range === '180d' ? 'Weekly totals' : 'Daily totals'}</span></div>
          <div className="reports-chart-legend">{activeTab === 'inventory' ? <span><i className="inventory-legend"/>Inventory value</span> : activeTab === 'purchases' ? <span><i className="purchase-legend"/>Received spend</span> : <><span><i className="revenue-legend"/>Revenue</span><span><i className="profit-legend"/>Gross profit</span>{activeTab === 'financial' && <><span><i className="purchase-legend"/>Purchases</span><span><i className="expense-legend"/>Operating expenses</span></>}</>}</div>
          <div className={`reports-chart ${activeTab === 'inventory' ? 'category-chart' : ''}`} role="img" aria-label={`${activeTab === 'inventory' ? 'Category inventory valuation' : `${report.range_days}-day ${activeTab} report trend`}`}>
            {chartData.map((day) => <div className="reports-chart-day" key={day.label} title={`${day.label}: ${currency(day.primary)}`}>
              <div className="reports-chart-bars">
                <i className={activeTab === 'inventory' ? 'inventory-bar' : activeTab === 'purchases' ? 'purchase-bar' : 'revenue-bar'} style={{ height: `${day.primary ? Math.max(day.primary / maxValue * 100, 2) : 0}%` }}/>
                {day.secondary > 0 && <i className="profit-bar" style={{ height: `${Math.max(day.secondary / maxValue * 100, 2)}%` }}/>}
                {day.tertiary > 0 && <i className="purchase-bar" style={{ height: `${Math.max(day.tertiary / maxValue * 100, 2)}%` }}/ >}
                {day.quaternary > 0 && <i className="expense-bar" style={{ height: `${Math.max(day.quaternary / maxValue * 100, 2)}%` }}/ >}
              </div>
            </div>)}
          </div>
          <div className="reports-chart-labels">{chartData.map((day, index) => <span key={day.label}>{activeTab === 'inventory' ? day.label : labelIndexes.has(index) ? day.label : ''}</span>)}</div>
        </section>
        <section className="overview-panel reports-category-panel"><div className="overview-panel-heading"><div><span>CATEGORY MIX</span><h2>{activeTab === 'inventory' ? 'Stock value' : activeTab === 'purchases' ? 'Received spend' : 'Sales distribution'}</h2></div><button className="overview-text-action" onClick={activeTab === 'purchases' ? onOpenPurchases : activeTab === 'inventory' ? onOpenInventory : onOpenPOS}>Details</button></div>
          <div className="reports-donut-wrap"><div className="reports-donut" style={{ background: donutGradient }}><div><small>{activeTab === 'inventory' ? 'AT COST' : activeTab === 'purchases' ? 'RECEIVED' : 'NET SALES'}</small><strong>{currency(activeTab === 'inventory' ? report.inventory_value : activeTab === 'purchases' ? report.purchase_spend : report.revenue)}</strong></div></div></div>
          {categories.length ? <div className="reports-category-list">{categories.slice(0, 5).map((category, index) => <div key={category.name}><span><i style={{ backgroundColor: palette[index % palette.length] }}/>{category.name}</span><strong>{currency(category.revenue)}</strong><small>{category.percent}%</small></div>)}</div> : <p className="overview-empty">No category activity in this period.</p>}
          {categoryTotal > 0 && <span className="reports-category-total">{categories.length} categories · 100% of period total</span>}
        </section>
      </div>
      <section className="catalog-table-panel reports-products-panel"><div className="reports-table-heading"><div><span>PRODUCT PERFORMANCE</span><h2>Top products by revenue</h2></div><button className="catalog-button catalog-button-light" onClick={onOpenInventory}><Package size={13}/>Inventory</button></div><div className="catalog-table-scroll"><table className="catalog-table reports-products-table"><thead><tr><th>#</th><th>PRODUCT</th><th>SKU</th><th>UNITS SOLD</th><th>AVG. PRICE</th><th>REVENUE</th><th>GROSS PROFIT</th><th>MARGIN</th></tr></thead><tbody>{report.top_products.slice(0, 8).map((product, index) => <tr key={product.product_sku}><td className="reports-rank">{String(index + 1).padStart(2, '0')}</td><td><strong>{product.product_name}</strong><small className="reports-category-name">{product.category_name}</small></td><td>{product.product_sku}</td><td>{product.units_sold.toLocaleString()}</td><td>{currency(product.average_price)}</td><td><strong>{currency(product.revenue)}</strong></td><td>{currency(product.gross_profit)}</td><td><span className="reports-margin">{product.gross_margin}%</span></td></tr>)}{!report.top_products.length && <tr><td colSpan={8} className="catalog-state">No completed sales in this period yet.</td></tr>}</tbody></table></div><footer className="catalog-table-footer"><span>Showing <b>{report.top_products.length}</b> top products for this period</span></footer></section>
    </>}
  </>;
}