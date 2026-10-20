import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Package, ShieldCheck, UserRoundPlus } from 'lucide-react';
import { api, type AccessUser } from './api';

type AccountMode = 'sign-in' | 'sign-up';

export default function AccountEntry({ onBack, onAuthenticated, initialMode = 'sign-in' }: {
  onBack: () => void;
  onAuthenticated: (user: AccessUser) => void;
  initialMode?: AccountMode;
}) {
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    const sessionCheckTimeout = window.setTimeout(() => {
      if (current) {
        setCheckingSession(false);
        setError('The server is taking longer than expected. You can still try signing in.');
      }
    }, 10000);
    void api.accountSession().then(({ user }) => {
      if (current) onAuthenticated(user);
    }).catch((cause: unknown) => {
      if (!current) return;
      const message = cause instanceof Error ? cause.message : '';
      if (!/(401|sign-in is required)/i.test(message)) {
        setError('Could not check your existing session. The server may be starting; you can still try signing in.');
      }
      setCheckingSession(false);
    }).finally(() => {
      window.clearTimeout(sessionCheckTimeout);
    });
    return () => {
      current = false;
      window.clearTimeout(sessionCheckTimeout);
    };
  }, [onAuthenticated]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-up') {
        const result = await api.accountSignUp({ username, email, password, first_name: firstName, last_name: lastName });
        onAuthenticated(result.user);
        return;
      }
      const result = await api.accountSignIn(username, password);
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account access failed.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="account-entry">
    <header className="account-entry-header">
      <button className="account-entry-brand" type="button" onClick={onBack} aria-label="Back to StockPulse landing page"><span><Package size={17}/></span><strong>StockPulse</strong><small>ERP SUITE</small></button>
      <span className="account-entry-header-note"><i/> WORKSPACE ACCOUNT ACCESS</span>
    </header>
    <section className="account-entry-content" aria-labelledby="account-entry-title">
      <div className="account-entry-card">
        <div className="account-entry-card-overline"><span><ShieldCheck size={14}/> STOCKPULSE WORKSPACE</span><span className="account-entry-node"><i/> ACCOUNT PORTAL</span></div>
        <h1 id="account-entry-title">{mode === 'sign-in' ? 'Sign in to StockPulse' : 'Sign up for StockPulse'}</h1>
        <p className="account-entry-intro">{mode === 'sign-in' ? 'Enter your account details to continue to your workspace.' : 'Sign up for a workspace account to get started.'}</p>
        {mode === 'sign-up' && <button className="account-entry-back-to-sign-in" type="button" onClick={() => { setMode('sign-in'); setError(''); setNotice(''); }}><ArrowLeft size={13}/> Back to sign in</button>}
        <div className="account-entry-tabs" role="tablist" aria-label="Account access mode">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => { setMode('sign-in'); setError(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => { setMode('sign-up'); setError(''); }}>Sign up</button>
        </div>
        {checkingSession && <div className="account-entry-status" role="status">Checking existing session…</div>}
        <form className="account-entry-form" onSubmit={(event) => void submit(event)}>
          {mode === 'sign-up' && <div className="account-entry-name-row"><label className="catalog-field">First name<input autoComplete="given-name" required maxLength={150} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></label><label className="catalog-field">Last name<input autoComplete="family-name" required maxLength={150} value={lastName} onChange={(event) => setLastName(event.target.value)}/></label></div>}
          <label className="catalog-field">Username<input autoComplete="username" required maxLength={150} value={username} onChange={(event) => setUsername(event.target.value)}/></label>
          {mode === 'sign-up' && <label className="catalog-field">Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>}
          <label className="catalog-field">Password<input type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={mode === 'sign-up' ? 8 : 1} value={password} onChange={(event) => setPassword(event.target.value)}/></label>
          {mode === 'sign-up' && <p className="account-entry-password-note"><KeyRound size={13}/> Use at least 8 characters.</p>}
          {mode === 'sign-up' && <label className="catalog-field">Confirm password<input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label>}
          {error && <p className="account-entry-error" role="alert">{error}</p>}
          {notice && <p className="account-entry-password-note" role="status">{notice}</p>}
          <button className="account-entry-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in to workspace' : 'Sign up'}<ArrowRight size={15}/></button>
        </form>
        <div className="account-entry-card-footer"><ShieldCheck size={14}/><span>{mode === 'sign-in' ? 'Your workspace account is protected by a secure session.' : 'New accounts receive full workspace access immediately.'}</span></div>
      </div>
      <p className="account-entry-access-note"><UserRoundPlus size={13}/> Administrator tools require an authorized account.</p>
    </section>
    <footer className="account-entry-footer"><span>© 2026 StockPulse Operations</span><span>INVENTORY · WORKFORCE · FINANCE</span></footer>
  </main>;
}