import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, Package, ShieldCheck, UserRoundPlus } from 'lucide-react';
import { api, type AccessUser } from './api';

type AccountMode = 'sign-in' | 'sign-up' | 'reset-password';

export default function AccountEntry({ onBack, onAuthenticated }: {
  onBack: () => void;
  onAuthenticated: (user: AccessUser) => void;
}) {
  const [mode, setMode] = useState<AccountMode>('sign-in');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    void api.accountSession().then(({ user }) => {
      if (current && user) onAuthenticated(user);
    }).catch(() => {
      if (current) setCheckingSession(false);
    });
    return () => { current = false; };
  }, [onAuthenticated]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'reset-password' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-up') {
        await api.accountSignUp({ username, email, password, first_name: firstName, last_name: lastName });
        setNotice('Account created. An administrator must grant admin access before you can sign in to the dashboards.');
        return;
      }
      if (mode === 'reset-password') {
        await api.accountResetPassword({ username: username || undefined, email: email || undefined, password, confirm_password: confirmPassword });
        setNotice('Your password was reset successfully. You can now sign in with your updated credentials.');
        setMode('sign-in');
        setPassword('');
        setConfirmPassword('');
        return;
      }
      const result = await api.accountSignIn(username, password);
      if (!result.user) {
        throw new Error('Sign-in response did not include account details.');
      }
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
        <h1 id="account-entry-title">{mode === 'sign-in' ? 'Sign in to StockPulse' : mode === 'sign-up' ? 'Sign up for StockPulse' : 'Reset your password'}</h1>
        <p className="account-entry-intro">{mode === 'sign-in' ? 'Enter your account details to continue to your workspace.' : mode === 'sign-up' ? 'Sign up for a workspace account to get started.' : 'Enter your username or email and choose a new password.'}</p>
        <div className="account-entry-tabs" role="tablist" aria-label="Account access mode">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => { setMode('sign-in'); setError(''); setNotice(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => { setMode('sign-up'); setError(''); setNotice(''); }}>Sign up</button>
        </div>
        {checkingSession ? <div className="account-entry-status" role="status">Checking existing session…</div> : <form className="account-entry-form" onSubmit={(event) => void submit(event)}>
          {mode === 'sign-up' && <div className="account-entry-name-row"><label className="catalog-field">First name<input autoComplete="given-name" required maxLength={150} value={firstName} onChange={(event) => setFirstName(event.target.value)}/></label><label className="catalog-field">Last name<input autoComplete="family-name" required maxLength={150} value={lastName} onChange={(event) => setLastName(event.target.value)}/></label></div>}
          {(mode === 'sign-in' || mode === 'reset-password') && <label className="catalog-field">Username or email<input autoComplete="username" required maxLength={150} value={username} onChange={(event) => setUsername(event.target.value)}/></label>}
          {mode === 'sign-up' && <label className="catalog-field">Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>}
          {mode !== 'sign-up' && <label className="catalog-field account-entry-password-field">
            <span>Password</span>
            <div className="account-entry-password-input">
              <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)}/>
              <button type="button" className="account-entry-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </label>}
          {mode === 'sign-up' && <label className="catalog-field account-entry-password-field">
            <span>Confirm password</span>
            <div className="account-entry-password-input">
              <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/>
              <button type="button" className="account-entry-password-toggle" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword((current) => !current)}>
                {showConfirmPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </label>}
          {mode === 'reset-password' && <label className="catalog-field account-entry-password-field">
            <span>Confirm new password</span>
            <div className="account-entry-password-input">
              <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/>
              <button type="button" className="account-entry-password-toggle" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword((current) => !current)}>
                {showConfirmPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </label>}
          {mode === 'sign-in' && <button type="button" className="account-entry-forgot-password" onClick={() => { setError(''); setNotice(''); setMode('reset-password'); setPassword(''); setConfirmPassword(''); }}>
            Forgot password?
          </button>}
          {mode === 'sign-up' && <p className="account-entry-password-note"><KeyRound size={13}/> Use at least 8 characters.</p>}
          {mode === 'reset-password' && <p className="account-entry-password-note"><KeyRound size={13}/> Choose a new password with at least 8 characters.</p>}
          {error && <p className="account-entry-error" role="alert">{error}</p>}
          {notice && <p className="account-entry-password-note" role="status">{notice}</p>}
          <button className="account-entry-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in to workspace' : mode === 'sign-up' ? 'Sign up' : 'Reset password'}<ArrowRight size={15}/></button>
          {mode === 'reset-password' && <button type="button" className="account-entry-forgot-password" onClick={() => { setMode('sign-in'); setError(''); setNotice(''); setPassword(''); setConfirmPassword(''); }}>
            Back to sign in
          </button>}
        </form>}
        <div className="account-entry-card-footer"><ShieldCheck size={14}/><span>{mode === 'sign-in' ? 'Your workspace account is protected by a secure session.' : 'New accounts receive standard workspace access.'}</span></div>
      </div>
      <p className="account-entry-access-note"><UserRoundPlus size={13}/> Administrator tools require an authorized account.</p>
    </section>
    <footer className="account-entry-footer"><span>© 2026 StockPulse Operations</span><span>INVENTORY · WORKFORCE · FINANCE</span></footer>
  </main>;
}