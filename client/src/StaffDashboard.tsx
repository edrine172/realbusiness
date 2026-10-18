import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Banknote, BriefcaseBusiness, CalendarDays, Check, ChevronDown,
  CircleAlert, Clock3, FileText, Filter, LogOut, Plus, RefreshCw,
  Search, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import {
  api, formatCurrency as currency, getCurrencyDisplay, type AccessUser, type PayrollRun,
  type StaffAttendance, type StaffDashboardData, type StaffMember, type StaffMemberInput,
} from './api';

type DashboardTarget = 'overview' | 'products' | 'inventory' | 'purchases' | 'pos' | 'sales' | 'reports' | 'customers' | 'suppliers' | 'expenses' | 'users' | 'settings';
type StaffFormValues = Omit<StaffMemberInput, 'hire_date'> & { hire_date: string };

const periodLabel = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-UG', { month: 'long', year: 'numeric' });
const thisPeriod = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not yet paid';
const isSunday = (date: string) => { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day).getDay() === 0; };
const dailyOutputTarget = (date: string) => isSunday(date) ? 10 : 15;
const dailyAttendanceWage = (date: string, attended: boolean, outputQuantity: string | number, payBasis: StaffMember['pay_basis']) => {
  if (!attended || payBasis !== 'daily') return 0;
  if (isSunday(date)) return Number(outputQuantity) >= dailyOutputTarget(date) ? 5000 : 4000;
  return Number(outputQuantity) >= dailyOutputTarget(date) ? 7000 : 6000;
};

function WorkerForm({ worker, onClose, onSaved }: {
  worker: StaffMember | null;
  onClose: () => void;
  onSaved: (worker: StaffMemberInput) => Promise<void>;
}) {
  const [form, setForm] = useState<StaffFormValues>(() => ({
    full_name: worker?.full_name ?? '', email: worker?.email ?? '', phone: worker?.phone ?? '',
    job_title: worker?.job_title ?? '', department: worker?.department ?? 'Warehouse & Logistics',
    pay_basis: worker?.pay_basis ?? 'monthly', pay_rate: worker?.pay_rate ?? '',
    hours_per_period: worker?.hours_per_period ?? '160', withholding_percent: worker?.withholding_percent ?? '0',
    benefit_deduction: worker?.benefit_deduction ?? '0', status: worker?.status ?? 'active',
    hire_date: worker?.hire_date ?? new Date().toISOString().slice(0, 10),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try { await onSaved(form.pay_basis === 'daily' ? { ...form, pay_rate: '7000' } : form); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Worker details could not be saved.'); }
    finally { setSaving(false); }
  }

  return <div className="catalog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="catalog-modal staff-worker-modal" onSubmit={(event) => void submit(event)}>
      <div className="catalog-modal-heading"><div><span className="catalog-eyebrow">PEOPLE OPERATIONS</span><h2>{worker ? 'Edit worker' : 'Add worker'}</h2><p>Maintain role, pay basis, and configured deductions.</p></div><button className="catalog-icon-button" type="button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
      <div className="catalog-form-row"><label className="catalog-field">Full name<input required maxLength={160} value={form.full_name} onChange={(event) => set('full_name', event.target.value)}/></label><label className="catalog-field">Department<input required maxLength={100} value={form.department} onChange={(event) => set('department', event.target.value)}/></label></div>
      <div className="catalog-form-row"><label className="catalog-field">Job title<input required maxLength={120} value={form.job_title} onChange={(event) => set('job_title', event.target.value)}/></label><label className="catalog-field">Work email<input type="email" value={form.email} onChange={(event) => set('email', event.target.value)}/></label></div>
      <div className="catalog-form-row"><label className="catalog-field">Phone<input value={form.phone} onChange={(event) => set('phone', event.target.value)}/></label><label className="catalog-field">Hire date<input type="date" required value={form.hire_date} onChange={(event) => set('hire_date', event.target.value)}/></label></div>
      <div className="catalog-form-row"><label className="catalog-field">Pay basis<select value={form.pay_basis} onChange={(event) => set('pay_basis', event.target.value as StaffMember['pay_basis'])}><option value="monthly">Monthly salary</option><option value="hourly">Hourly wage</option><option value="daily">Daily wage</option></select></label>{form.pay_basis === 'daily' ? <p className="staff-form-note">Monday to Saturday: 15+ units earns UGX 7,000; fewer units earns UGX 6,000. Sunday: 10+ units earns UGX 5,000; fewer units earns UGX 4,000.</p> : <label className="catalog-field">Pay rate (UGX)<input type="number" min="0.01" step="0.01" required value={form.pay_rate} onChange={(event) => set('pay_rate', event.target.value)}/></label>}</div>
      {form.pay_basis === 'hourly' && <label className="catalog-field">Hours per pay period<input type="number" min="0.01" step="0.25" required value={form.hours_per_period} onChange={(event) => set('hours_per_period', event.target.value)}/></label>}
      <div className="catalog-form-row"><label className="catalog-field">Configured withholding (%)<input type="number" min="0" max="100" step="0.01" value={form.withholding_percent} onChange={(event) => set('withholding_percent', event.target.value)}/></label><label className="catalog-field">Benefits deduction (UGX)<input type="number" min="0" step="0.01" value={form.benefit_deduction} onChange={(event) => set('benefit_deduction', event.target.value)}/></label></div>
      {worker && <label className="catalog-field">Employment status<select value={form.status} onChange={(event) => set('status', event.target.value as StaffMember['status'])}><option value="active">Active</option><option value="leave">On leave</option><option value="inactive">Inactive</option></select></label>}
      <p className="staff-form-note"><ShieldCheck size={13}/> Withholding is an administrator-configured estimate, not statutory tax advice.</p>
      {error && <p className="catalog-form-error">{error}</p>}
      <div className="catalog-modal-actions"><button type="button" className="catalog-button catalog-button-light" onClick={onClose}>Cancel</button><button className="catalog-button catalog-button-primary" disabled={saving}>{saving ? 'Saving…' : worker ? 'Save worker' : 'Enroll worker'}</button></div>
    </form>
  </div>;
}

function DailyAttendancePanel({ period, workers, locked, selectedWorkerId, monthlyGrossByWorker, onSelectedWorkerChange, panelRef, onPeriodChange, onSaved }: {
  period: string;
  workers: StaffMember[];
  locked: boolean;
  selectedWorkerId: number | null;
  monthlyGrossByWorker: Record<number, number>;
  onSelectedWorkerChange: (workerId: number | null) => void;
  panelRef: React.RefObject<HTMLElement>;
  onPeriodChange: (period: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(`${period}-01`);
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendance[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { attended: boolean; output_quantity: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [year, month] = period.split('-').map(Number);
  const numberOfDays = new Date(year, month, 0).getDate();
  const periodEnd = `${period}-${String(numberOfDays).padStart(2, '0')}`;
  const periodWorkers = workers.filter((worker) => worker.status === 'active' && worker.hire_date <= periodEnd);
  const attendanceWorkers = periodWorkers.filter((worker) => worker.hire_date <= date);
  const dailyWageWorkers = attendanceWorkers.filter((worker) => worker.pay_basis === 'daily');
  const selectedWorker = periodWorkers.find((worker) => worker.id === selectedWorkerId) ?? null;
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: numberOfDays }, (_, index) => index + 1),
  ];
  const recordsByDate = attendanceRecords.reduce<Record<string, StaffAttendance[]>>((grouped, record) => {
    (grouped[record.date] ??= []).push(record);
    return grouped;
  }, {});
  const selectedDateRecords = recordsByDate[date] ?? [];
  const selectedWorkerRecord = selectedWorker ? selectedDateRecords.find((record) => record.worker === selectedWorker.id) : undefined;
  const selectedWorkerAttendance = selectedWorker
    ? attendanceRecords.filter((record) => record.worker === selectedWorker.id).sort((first, second) => first.date.localeCompare(second.date))
    : [];
  const selectedWorkerMonthTotal = selectedWorker
    ? selectedWorker.pay_basis === 'daily'
      ? selectedWorkerAttendance.reduce((total, record) => total + (record.attended ? Number(record.daily_wage) : 0), 0)
      : monthlyGrossByWorker[selectedWorker.id] ?? 0
    : 0;
  const selectedWorkerDaysWorked = selectedWorkerAttendance.filter((record) => record.attended).length;
  const today = new Date().toISOString().slice(0, 10);
  const presentCount = attendanceWorkers.filter((worker) => drafts[worker.id]?.attended).length;
  const dailyTotal = dailyWageWorkers.reduce((total, worker) => {
    const draft = drafts[worker.id] ?? { attended: false, output_quantity: '' };
    return total + dailyAttendanceWage(date, draft.attended, draft.output_quantity, worker.pay_basis);
  }, 0);
  const monthTotal = periodWorkers.filter((worker) => worker.pay_basis === 'daily').reduce((total, worker) => total + Number(worker.period_gross || 0), 0);

  useEffect(() => { setDate(`${period}-01`); onSelectedWorkerChange(null); }, [period, onSelectedWorkerChange]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void api.staffAttendance(period).then((records) => {
      if (!current) return;
      setAttendanceRecords(records);
    }).catch((cause) => {
      if (current) setError(cause instanceof Error ? cause.message : 'Attendance could not be loaded.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [period, workers]);

  useEffect(() => {
    const existing = new Map<number, StaffAttendance>((recordsByDate[date] ?? []).map((record) => [record.worker, record]));
    setDrafts(Object.fromEntries(attendanceWorkers.map((worker) => {
      const record = existing.get(worker.id);
      return [worker.id, { attended: record?.attended ?? false, output_quantity: String(record?.output_quantity ?? '') }];
    })));
  }, [date, attendanceRecords, workers]);

  function updateDraft(worker: StaffMember, changes: Partial<{ attended: boolean; output_quantity: string }>) {
    setDrafts((current) => ({
      ...current,
      [worker.id]: { attended: current[worker.id]?.attended ?? false, output_quantity: current[worker.id]?.output_quantity ?? '', ...changes },
    }));
  }

  async function saveAttendance() {
    const missingOutput = dailyWageWorkers.some((worker) => {
      const draft = drafts[worker.id];
      return draft?.attended && draft.output_quantity.trim() === '';
    });
    if (missingOutput) { setError('Enter actual units for each attended daily-paid worker.'); return; }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const savedRecords = await api.recordStaffAttendance(date, attendanceWorkers.map((worker) => {
        const draft = drafts[worker.id] ?? { attended: false, output_quantity: '' };
        return { worker: worker.id, attended: draft.attended, output_quantity: draft.attended && worker.pay_basis === 'daily' ? Number(draft.output_quantity) || 0 : 0 };
      }));
      setAttendanceRecords((current) => [...current.filter((record) => record.date !== date), ...savedRecords]);
      await onSaved();
      setNotice(`Attendance saved for ${new Date(`${date}T00:00:00`).toLocaleDateString('en-UG', { day: 'numeric', month: 'long' })}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Attendance could not be saved.'); }
    finally { setSaving(false); }
  }

  return <section className="staff-attendance-panel" ref={panelRef}>
    <div className="staff-section-heading">
      <div><span className="staff-section-icon"><CalendarDays size={14}/></span><div><h2>Daily attendance &amp; wages</h2><p>{selectedWorker ? `${selectedWorker.full_name} · ${selectedWorker.pay_basis === 'daily' ? `month to date ${currency(selectedWorkerMonthTotal)}` : selectedWorker.pay_basis_display}` : `Daily wages month to date: ${currency(monthTotal)}`}</p></div></div>
      <div className="staff-attendance-header-actions"><label className="staff-attendance-month-select"><span>Attendance month</span><input aria-label="Select attendance month and year" type="month" value={period} onChange={(event) => { if (event.target.value) onPeriodChange(event.target.value); }}/></label><div className="staff-attendance-selected-date"><span>Selected day</span><strong>{new Date(`${date}T00:00:00`).toLocaleDateString('en-UG', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div></div>
    </div>
    <div className="staff-attendance-summary"><span>{selectedWorker ? selectedWorkerRecord ? `${selectedWorker.full_name}: ${selectedWorkerRecord.attended ? 'Worked' : 'Did not work'} on this date` : selectedWorker.hire_date > date ? `${selectedWorker.full_name} was not employed yet` : `No attendance entry for ${selectedWorker.full_name} on this date` : selectedDateRecords.length ? `${presentCount} of ${attendanceWorkers.length} workers marked present` : 'Attendance has not been recorded for this day'}</span><strong>{selectedWorker ? selectedWorkerRecord ? currency(selectedWorkerRecord.daily_wage) : '—' : currency(dailyTotal)} for this day</strong></div>
    <div className="staff-attendance-workers" role="group" aria-label="Select a worker calendar"><button type="button" className={!selectedWorkerId ? 'is-selected' : ''} aria-pressed={!selectedWorkerId} onClick={() => onSelectedWorkerChange(null)}>All workers</button>{periodWorkers.map((worker) => <button type="button" key={worker.id} className={selectedWorkerId === worker.id ? 'is-selected' : ''} aria-pressed={selectedWorkerId === worker.id} onClick={() => onSelectedWorkerChange(worker.id)}><strong>{worker.full_name}</strong><small>{worker.job_title}</small></button>)}</div>
    {selectedWorker && <section className="staff-worker-month-earnings" aria-label={`${selectedWorker.full_name} earnings for ${periodLabel(period)}`}>
      <div className="staff-worker-month-total"><span><small>{selectedWorker.pay_basis === 'daily' ? 'EARNED THIS MONTH' : 'MONTHLY PAYROLL GROSS'} · {periodLabel(period)}</small><strong>{currency(selectedWorkerMonthTotal)}</strong></span><span>{selectedWorker.pay_basis === 'daily' ? `${selectedWorkerDaysWorked} paid work ${selectedWorkerDaysWorked === 1 ? 'day' : 'days'}` : `${selectedWorker.pay_basis_display} · payroll gross`}</span></div>
      {selectedWorker.pay_basis !== 'daily' && <p className="staff-worker-month-note">This worker is not paid by the day. Daily attendance is listed below; daily earnings are not calculated for this pay basis.</p>}
      <div className="staff-worker-earnings-scroll"><table className="staff-worker-earnings"><thead><tr><th>DATE</th><th>ATTENDANCE</th><th>UNITS</th><th>DAILY EARNINGS</th></tr></thead><tbody>
        {selectedWorkerAttendance.map((record) => <tr key={record.id}><td>{new Date(`${record.date}T00:00:00`).toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>{record.attended ? 'Worked' : 'Did not work'}</td><td>{record.attended && selectedWorker.pay_basis === 'daily' ? record.output_quantity.toLocaleString() : '—'}</td><td>{selectedWorker.pay_basis === 'daily' ? currency(record.attended ? record.daily_wage : 0) : 'Not calculated'}</td></tr>)}
        {!selectedWorkerAttendance.length && <tr><td colSpan={4} className="staff-worker-earnings-empty">No attendance has been recorded for this worker in {periodLabel(period)}.</td></tr>}
      </tbody></table></div>
    </section>}
    <div className="staff-calendar" aria-label={`Attendance calendar for ${periodLabel(period)}`}>
      <div className="staff-calendar-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="staff-calendar-grid">{calendarCells.map((day, index) => {
        if (day === null) return <span className="staff-calendar-blank" key={`blank-${index}`}/>;
        const dayDate = `${period}-${String(day).padStart(2, '0')}`;
        const records = recordsByDate[dayDate] ?? [];
        const workerRecord = selectedWorker ? records.find((record) => record.worker === selectedWorker.id) : undefined;
        const dayPresent = records.filter((record) => record.attended).length;
        const dayTotal = records.reduce((sum, record) => sum + (record.attended ? Number(record.daily_wage) : 0), 0);
        const workerStatus = workerRecord ? workerRecord.attended ? 'Worked' : 'Did not work' : selectedWorker?.hire_date && selectedWorker.hire_date > dayDate ? 'Not employed' : 'No entry';
        const statusClass = selectedWorker ? workerRecord ? workerRecord.attended ? 'is-worked' : 'is-absent' : selectedWorker.hire_date > dayDate ? 'is-not-employed' : 'is-unrecorded' : records.length ? 'has-records' : '';
        const accessibleStatus = selectedWorker ? `${selectedWorker.full_name}: ${workerStatus}` : `${dayPresent} of ${attendanceWorkers.length} present, ${currency(dayTotal)}`;
        return <button className={`staff-calendar-day ${date === dayDate ? 'is-selected' : ''} ${statusClass}`} type="button" key={dayDate} disabled={dayDate > today} aria-pressed={date === dayDate} aria-label={`${new Date(`${dayDate}T00:00:00`).toLocaleDateString('en-UG', { day: 'numeric', month: 'long' })}: ${accessibleStatus}`} onClick={() => setDate(dayDate)}>
          <strong>{day}</strong>{selectedWorker ? <><span>{workerStatus}</span>{workerRecord?.attended && <small>{workerRecord.output_quantity} units · {currency(workerRecord.daily_wage)}</small>}</> : records.length ? <><span>{dayPresent}/{records.length} present</span><small>{currency(dayTotal)}</small></> : <span className="staff-calendar-empty">No entries</span>}
        </button>;
      })}</div>
    </div>
    {error && <div className="staff-message is-error"><CircleAlert size={14}/><span>{error}</span></div>}
    {notice && <div className="staff-message is-success"><Check size={14}/><span>{notice}</span></div>}
    {loading && <div className="staff-history-empty">Loading attendance records…</div>}
    {attendanceWorkers.length ? <div className="catalog-table-scroll"><table className="catalog-table staff-attendance-table"><thead><tr><th>WORKER</th><th>ATTENDANCE</th><th>ACTUAL UNITS / TARGET ({dailyOutputTarget(date)})</th><th>CALCULATED WAGE ({getCurrencyDisplay().currency})</th></tr></thead><tbody>{attendanceWorkers.map((worker) => {
      const draft = drafts[worker.id] ?? { attended: false, output_quantity: '' };
      const hasRecord = selectedDateRecords.some((record) => record.worker === worker.id);
      const wage = dailyAttendanceWage(date, draft.attended, draft.output_quantity, worker.pay_basis);
      return <tr key={worker.id} className={selectedWorkerId === worker.id ? 'is-selected-worker' : ''}><td><button type="button" className="staff-attendance-worker-link" aria-pressed={selectedWorkerId === worker.id} onClick={() => onSelectedWorkerChange(worker.id)}><strong>{worker.full_name}</strong><small>{worker.employee_number} · {worker.job_title}</small></button></td><td><label className="staff-attendance-check"><input type="checkbox" checked={draft.attended} disabled={locked} onChange={(event) => updateDraft(worker, { attended: event.target.checked })}/><span>{hasRecord ? draft.attended ? 'Worked' : 'Did not work' : draft.attended ? 'Worked (unsaved)' : 'No entry'}</span></label></td><td>{worker.pay_basis === 'daily' ? <input className="staff-attendance-wage" type="number" min="0" step="1" aria-label={`${worker.full_name} actual units completed on ${date}`} value={draft.output_quantity} placeholder="Units completed" disabled={!draft.attended || locked} onChange={(event) => updateDraft(worker, { output_quantity: event.target.value })}/> : <span className="staff-attendance-not-applicable">Attendance only</span>}</td><td>{worker.pay_basis === 'daily' ? <span className="staff-attendance-calculated-wage"><strong>{currency(wage)}</strong><small>{isSunday(date) ? Number(draft.output_quantity) >= dailyOutputTarget(date) ? 'Sunday target met' : 'Sunday below target' : Number(draft.output_quantity) >= dailyOutputTarget(date) ? 'Target met' : 'Below target'}</small></span> : <span className="staff-attendance-not-applicable">—</span>}</td></tr>;
    })}</tbody></table></div> : <div className="staff-history-empty">Add an active worker to record attendance.</div>}
    <div className="staff-attendance-footer"><span>{locked ? 'Attendance is locked because payroll has been generated for this month.' : 'Daily-paid workers’ attendance wages are totaled into payroll.'}</span><button className="catalog-button catalog-button-primary" onClick={() => void saveAttendance()} disabled={!attendanceWorkers.length || loading || saving || locked || date > today}>{saving ? 'Saving…' : 'Save attendance'}</button></div>
  </section>;
}

function AdminLogin({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError('');
    try { await onLogin(username, password); }
    catch (cause) { setLoginError(cause instanceof Error ? cause.message : 'Administrator sign-in failed.'); }
    finally { setBusy(false); }
  }
  return <div className="access-login-wrap"><form className="access-login-panel" onSubmit={(event) => void submit(event)}><span className="access-login-icon"><BriefcaseBusiness size={22}/></span><span className="access-eyebrow">STOCKPULSE PEOPLE OPERATIONS</span><h1>Staff &amp; Payroll</h1><p>Sign in as an administrator to view compensation and manage payroll.</p><label className="catalog-field">Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)}/></label><label className="catalog-field">Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>{loginError && <p className="catalog-form-error">{loginError}</p>}<button className="catalog-button catalog-button-primary access-login-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form></div>;
}

export default function StaffDashboard({ onNavigate, onSignOut }: { onNavigate: (target: DashboardTarget) => void; onSignOut: () => Promise<void> }) {
  const [dashboard, setDashboard] = useState<StaffDashboardData | null>(null);
  const [admin, setAdmin] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRun, setSavingRun] = useState(false);
  const [period, setPeriod] = useState(thisPeriod);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workerForm, setWorkerForm] = useState<StaffMember | null | undefined>(undefined);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const attendancePanelRef = useRef<HTMLElement>(null);

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const session = await api.accessSession();
      setAdmin(session.user);
      setDashboard(await api.staffDashboard(period));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The staff service could not be reached.';
      if (!/administrator sign-in required|authentication credentials/i.test(message)) {
        setError(message);
      } else setAdmin(null);
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadDashboard(); }, [period]);

  async function signIn(username: string, password: string) {
    setError('');
    try {
      const result = await api.accessLogin(username, password);
      setAdmin(result.user);
      setDashboard(await api.staffDashboard(period));
    } catch (cause) {
      setAdmin(null);
      throw cause;
    }
  }

  async function signOut() {
    try { await onSignOut(); }
    finally { setAdmin(null); setDashboard(null); }
  }

  const workers = useMemo(() => (dashboard?.workers ?? []).filter((worker) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || `${worker.full_name} ${worker.employee_number} ${worker.job_title} ${worker.email}`.toLowerCase().includes(term);
    return matchesSearch && (departmentFilter === 'all' || worker.department === departmentFilter) && (statusFilter === 'all' || worker.status === statusFilter);
  }), [dashboard, search, departmentFilter, statusFilter]);
  const summary = dashboard?.summary;
  const currentRun = dashboard?.payroll_runs.find((run) => run.period === period) ?? null;
  const payrollTotals = currentRun ?? summary!;
  const monthlyGrossByWorker = useMemo(() => dashboard?.workers.reduce<Record<number, number>>((totals, worker) => {
    const payrollLine = currentRun?.lines.find((line) => line.worker === worker.id);
    totals[worker.id] = Number(payrollLine?.gross_pay ?? (
      worker.pay_basis === 'monthly'
        ? worker.pay_rate
        : worker.pay_basis === 'hourly'
          ? Number(worker.pay_rate) * Number(worker.hours_per_period)
          : worker.period_gross
    ));
    return totals;
  }, {}) ?? {}, [dashboard, currentRun]);

  async function saveWorker(payload: StaffMemberInput) {
    if (workerForm) await api.updateStaffMember(workerForm.id, payload);
    else await api.createStaffMember(payload);
    setWorkerForm(undefined);
    await loadDashboard();
    setNotice(workerForm ? 'Worker profile updated.' : 'Worker enrolled in the staff directory.');
  }

  async function generatePayroll() {
    if (!window.confirm(`Generate a payroll snapshot for ${periodLabel(period)}? This will not initiate a bank transfer.`)) return;
    setSavingRun(true);
    setError('');
    try {
      const run = await api.generatePayrollRun(period);
      await loadDashboard();
      setNotice(`${periodLabel(run.period)} payroll generated for ${run.worker_count} workers.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payroll could not be generated.'); }
    finally { setSavingRun(false); }
  }

  async function markPaid(run: PayrollRun) {
    if (!window.confirm(`Mark the ${periodLabel(run.period)} payroll as paid? Confirm only after the transfer is completed externally.`)) return;
    setError('');
    try {
      await api.markPayrollPaid(run.id);
      await loadDashboard();
      setNotice(`${periodLabel(run.period)} payroll marked paid.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payroll status could not be updated.'); }
  }

  if (loading && !admin) return <section className="overview-state">Checking administrator session…</section>;
  if (!admin) return <AdminLogin onLogin={signIn}/>;
  if (!dashboard || !summary) return <section className="overview-state overview-error"><strong>Could not load staff and payroll</strong><span>{error}</span><button className="catalog-button catalog-button-light" onClick={() => void loadDashboard()}><RefreshCw size={14}/>Retry</button></section>;

  const paidPercentage = currentRun?.status === 'paid' ? 100 : currentRun ? 75 : 0;

  return <div className="staff-page">
    <section className="catalog-heading staff-heading"><div><div className="catalog-breadcrumb">Human Resources &amp; Compensation <span>›</span> <b>Worker Payroll &amp; Salaries</b></div><h1>Workers &amp; Monthly Payroll Management</h1><p>Manage staff records, pay details, and monthly payroll snapshots across the organization.</p></div><div className="catalog-heading-actions staff-heading-actions"><label className="catalog-select staff-period-select"><CalendarDays size={13}/><input aria-label="Payroll period" type="month" value={period} onChange={(event) => setPeriod(event.target.value)}/><ChevronDown size={12}/></label><span className={`staff-period-status ${currentRun?.status === 'paid' ? 'is-paid' : ''}`}><i/>{currentRun ? currentRun.status_display : 'Draft preview'} · {periodLabel(period)}</span><button className="catalog-button catalog-button-light" onClick={() => void loadDashboard()} disabled={loading}><RefreshCw size={13}/>Refresh</button><button className="catalog-button catalog-button-light" onClick={() => void signOut()}><LogOut size={13}/>Sign out</button></div></section>

    {error && <div className="staff-message is-error"><CircleAlert size={14}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={13}/></button></div>}
    {notice && <div className="staff-message is-success"><Check size={14}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={13}/></button></div>}

    <section className="staff-metrics" aria-label="Payroll summary">
      <article className="staff-metric net"><div><span>MONTHLY NET PAY</span><Wallet size={15}/></div><strong>{currency(payrollTotals.net_total)}</strong><small>{currentRun ? 'Snapshot for selected pay period' : 'Draft estimate for active staff'}</small></article>
      <article className="staff-metric"><div><span>GROSS WAGES</span><Banknote size={15}/></div><strong>{currency(payrollTotals.gross_total)}</strong><small>Before configured deductions</small></article>
      <article className="staff-metric tax"><div><span>WITHHOLDING &amp; BENEFITS</span><FileText size={15}/></div><strong>{currency(Number(payrollTotals.withholding_total) + Number(payrollTotals.benefits_total))}</strong><small>{currency(payrollTotals.withholding_total)} withholding · {currency(payrollTotals.benefits_total)} benefits</small></article>
      <article className="staff-metric workforce"><div><span>ACTIVE WORKFORCE</span><Users size={15}/></div><strong>{summary.active_workers} workers</strong><small>{summary.on_leave_workers} on leave · {summary.inactive_workers} inactive</small></article>
      <article className="staff-metric disbursement"><div><span>DISBURSEMENT STATUS</span><ShieldCheck size={15}/></div><strong>{currentRun?.status === 'paid' ? 'Paid' : currentRun ? 'Ready to review' : 'Draft'}</strong><div className="staff-progress"><i style={{ width: `${paidPercentage}%` }}/></div><small>{currentRun ? `${currentRun.worker_count} worker records · ${dateLabel(currentRun.paid_at)}` : 'No payroll run for this period'}</small></article>
    </section>

    <DailyAttendancePanel key={period} period={period} workers={dashboard.workers} locked={Boolean(currentRun)} selectedWorkerId={selectedWorkerId} monthlyGrossByWorker={monthlyGrossByWorker} onSelectedWorkerChange={setSelectedWorkerId} panelRef={attendancePanelRef} onPeriodChange={setPeriod} onSaved={loadDashboard}/>

    <div className="staff-main-grid">
      <section className="staff-ledger-panel">
        <div className="staff-ledger-toolbar"><label className="catalog-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, role, email"/></label><label className="catalog-select"><Filter size={12}/><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{dashboard.departments.map((department) => <option key={department.name} value={department.name}>{department.name}</option>)}</select><ChevronDown size={11}/></label><label className="catalog-select"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="leave">On leave</option><option value="inactive">Inactive</option></select><ChevronDown size={11}/></label></div>
        <div className="staff-ledger-actions"><span><Users size={13}/>{workers.length} workers shown</span><button className="catalog-button catalog-button-light" onClick={() => setWorkerForm(null)}><Plus size={13}/>Add worker</button><button className="catalog-button catalog-button-primary" onClick={() => void generatePayroll()} disabled={savingRun || Boolean(currentRun)}><BriefcaseBusiness size={13}/>{savingRun ? 'Generating…' : currentRun ? 'Payroll generated' : 'Generate payroll'}</button></div>
        <div className="catalog-table-scroll staff-table-scroll"><table className="catalog-table staff-table"><thead><tr><th>NAME</th><th>ROLE</th><th>DAYS</th><th>RATE ({getCurrencyDisplay().currency})</th><th>PAID</th><th>UNPAID DAYS</th><th>DUE</th><th>ACTION</th></tr></thead><tbody>{workers.map((worker) => {
          const payrollLine = currentRun?.lines.find((line) => line.worker === worker.id);
          const gross = Number(payrollLine?.gross_pay ?? (worker.pay_basis === 'monthly' ? worker.pay_rate : worker.pay_basis === 'hourly' ? Number(worker.pay_rate) * Number(worker.hours_per_period) : worker.period_gross));
          const withholding = Number(payrollLine?.withholding ?? gross * Number(worker.withholding_percent) / 100);
          const benefits = Number(payrollLine?.benefits ?? (worker.pay_basis === 'daily' ? Math.min(Number(worker.benefit_deduction), gross) : worker.benefit_deduction));
          const netPay = Number(payrollLine?.net_pay ?? Math.max(0, gross - withholding - benefits));
          const paidAmount = currentRun?.status === 'paid' ? netPay : 0;
          const amountDue = currentRun?.status === 'paid' ? 0 : netPay;
          return <tr key={worker.id}>
            <td><button type="button" className={`staff-ledger-value staff-ledger-identity staff-roster-worker-link ${selectedWorkerId === worker.id ? 'is-selected' : ''}`} aria-pressed={selectedWorkerId === worker.id} onClick={() => { setSelectedWorkerId(worker.id); attendancePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><strong>{worker.full_name}</strong><small>{worker.employee_number}</small></button></td>
            <td><span className="staff-ledger-value staff-ledger-identity"><strong>{worker.job_title}</strong><small>{worker.department}</small></span></td>
            <td><span className="staff-ledger-value">{worker.period_days_worked || '—'}</span></td>
            <td><span className="staff-ledger-value staff-ledger-money"><strong>{worker.pay_basis === 'daily' ? `${currency(7000)} / ${currency(6000)}` : currency(worker.pay_rate)}</strong><small>{worker.pay_basis === 'daily' ? `Sunday (10+ units) ${currency(5000)} / ${currency(4000)}` : worker.pay_basis_display}</small></span></td>
            <td><span className="staff-ledger-value staff-ledger-money">{currency(paidAmount)}</span></td>
            <td><span className="staff-ledger-value" title="Scheduled and unpaid days are not tracked yet">—</span></td>
            <td><span className="staff-ledger-value staff-ledger-money staff-ledger-due">{currency(amountDue)}</span></td>
            <td><button className="catalog-button catalog-button-light staff-edit-button" onClick={() => setWorkerForm(worker)}>Edit</button></td>
          </tr>;
        })}{!workers.length && <tr><td colSpan={8} className="catalog-state">No workers match these filters. Add a worker to begin.</td></tr>}</tbody></table></div>
        <footer className="staff-table-footer"><span>Payroll amounts are stored in UGX; displayed values use {getCurrencyDisplay().currency}. Bank transfers are not initiated by this dashboard.</span><span>{dashboard.workers.length} total records</span></footer>
      </section>

      <aside className="staff-side-column">
        <section className="staff-approval-panel"><div className="staff-side-title"><span><BriefcaseBusiness size={15}/></span><div><h2>Payroll run</h2><small>{currentRun ? `Run ${currentRun.period}` : 'Selected period preview'}</small></div><i className={currentRun?.status === 'paid' ? 'paid' : ''}>{currentRun?.status_display ?? 'Draft'}</i></div>
          <div className="staff-readiness"><div className="staff-readiness-ring" style={{ '--readiness': `${paidPercentage || (summary.active_workers ? 75 : 0)}%` } as React.CSSProperties}><strong>{paidPercentage || (summary.active_workers ? 75 : 0)}%</strong></div><span><strong>{currentRun?.status === 'paid' ? 'Run complete' : currentRun ? 'Ready for review' : 'Preview calculated'}</strong><small>{summary.active_workers} active workers · {currentRun?.worker_count ?? summary.active_workers} pay entries</small></span></div>
          <ul className="staff-checklist"><li><Check size={13}/><span>Worker status and pay details included</span></li><li><Check size={13}/><span>Configured deductions validated against gross</span></li><li><Clock3 size={13}/><span>{currentRun ? `Created ${dateLabel(currentRun.created_at)}` : 'No run has been generated for this period'}</span></li></ul>
          {currentRun?.status === 'scheduled' && <button className="catalog-button catalog-button-primary staff-pay-button" onClick={() => void markPaid(currentRun)}><Check size={14}/>Mark as paid</button>}
          <p className="staff-caveat">Mark as paid only after your bank or payroll provider confirms the transfer.</p>
        </section>

        <section className="staff-enroll-panel"><div className="staff-side-title"><span><Plus size={15}/></span><div><h2>People operations</h2><small>Connected workspaces</small></div></div><button className="staff-link-row" onClick={() => onNavigate('users')}><Users size={14}/><span><strong>Users &amp; Roles</strong><small>Login accounts and permissions</small></span><ArrowRight size={14}/></button><button className="staff-link-row" onClick={() => onNavigate('expenses')}><Wallet size={14}/><span><strong>Expenses</strong><small>Operating expenses and budgets</small></span><ArrowRight size={14}/></button><button className="staff-link-row" onClick={() => onNavigate('reports')}><FileText size={14}/><span><strong>Reports</strong><small>Financial and operations reporting</small></span><ArrowRight size={14}/></button></section>

        <section className="staff-history-panel"><div className="staff-side-title"><span><Clock3 size={15}/></span><div><h2>Payroll history</h2><small>{dashboard.payroll_runs.length} recent runs</small></div></div>{dashboard.payroll_runs.length ? dashboard.payroll_runs.map((run) => <button className="staff-history-row" key={run.id} onClick={() => setPeriod(run.period)}><span><strong>{periodLabel(run.period)}</strong><small>{run.worker_count} workers · {run.status_display}</small></span><strong>{currency(run.net_total)}</strong></button>) : <p className="staff-history-empty">Payroll runs will appear here after the first monthly snapshot.</p>}</section>
      </aside>
    </div>

    {dashboard.payroll_runs.some((run) => run.period === period) && <section className="staff-payroll-details"><div className="staff-section-heading"><div><span className="staff-section-icon"><FileText size={14}/></span><div><h2>{periodLabel(period)} payroll ledger</h2><p>Per-worker amounts snapshotted at generation time.</p></div></div><span>{currentRun?.status_display ?? 'History'}</span></div><div className="catalog-table-scroll"><table className="catalog-table staff-payroll-table"><thead><tr><th>WORKER</th><th>DEPARTMENT</th><th>DAYS WORKED</th><th>GROSS</th><th>WITHHOLDING</th><th>BENEFITS</th><th>NET PAY</th></tr></thead><tbody>{(currentRun?.lines ?? []).map((line) => <tr key={line.id}><td><strong>{line.worker_name}</strong><small>{line.employee_number}</small></td><td>{line.department}</td><td>{line.pay_basis === 'daily' ? line.days_worked : line.pay_basis === 'hourly' ? `${line.hours} hours` : '—'}</td><td>{currency(line.gross_pay)}</td><td>{currency(line.withholding)}</td><td>{currency(line.benefits)}</td><td><strong>{currency(line.net_pay)}</strong></td></tr>)}</tbody></table></div></section>}

    <footer className="staff-page-footer"><span><ShieldCheck size={12}/> Compensation details are restricted to administrators.</span><span>UGX · Uganda Shilling</span></footer>
    {workerForm !== undefined && <WorkerForm worker={workerForm} onClose={() => setWorkerForm(undefined)} onSaved={saveWorker}/>}
  </div>;
}