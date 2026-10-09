import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { ErrorBox, Field } from '../components/ui';
import { api, customerError } from '../lib/api';
import { homeFor } from '../lib/home';
import { track } from '../lib/track';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/config';

function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next') || '';
  // Only allow in-app relative redirects.
  return next.startsWith('/') && !next.startsWith('//') ? next : '';
}

function AuthShell({ children, back }: { children: React.ReactNode; back?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="auth-page">
      <div className="auth-hero">
        {back && (
          <button className="map-back" onClick={() => nav(-1)} aria-label="Kthehu">
            <Icon name="left" size={22} />
          </button>
        )}
        <Logo size="lg" tagline />
      </div>
      <div className="auth-card">{children}</div>
    </div>
  );
}

export function Login() {
  const { login, user } = useAuth();
  const { config } = useConfig();
  const next = useNext();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next || homeFor(user)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!phone || !password) return setError('Shkruaj numrin e telefonit dhe fjalëkalimin');
    setBusy(true);
    try {
      const u = await login(phone, password);
      if (u.role === 'customer') track('login', `Signed in as ${u.full_name}`);
      nav(next || homeFor(u), { replace: true });
    } catch (err) {
      setError(customerError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h2>Mirë se u ktheve</h2>
      <p className="muted">Hyr dhe porosit — ne dalim për ty</p>
      <form onSubmit={submit} noValidate>
        <Field label="Numri i telefonit" icon="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="044 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="pw-field">
          <Field label="Fjalëkalimi" icon="power" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>
            {show ? 'Fshih' : 'Shfaq'}
          </button>
        </div>
        <div className="auth-links">
          <Link to="/forgot">Harruat fjalëkalimin?</Link>
        </div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? 'Po hyn…' : 'Hyr'} <Icon name="right" />
        </button>
      </form>
      <div className="or">OSE</div>
      <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="btn btn-outline btn-block">
        <Icon name="user" size={18} /> Krijo llogari të re
      </Link>
      <div className="auth-foot">
        <span>
          <Icon name="clock" size={16} /> {config ? `${config.open_time}–${config.close_time}` : '14:00–23:00'}
        </span>
        <span>
          <Icon name="pin" size={16} /> Viti, Kosovë
        </span>
        <span>
          <Icon name="cart" size={16} /> Min. €{((config?.min_order_cents ?? 500) / 100).toFixed(0)}
        </span>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { register, user } = useAuth();
  const next = useNext();
  const nav = useNavigate();
  const [f, setF] = useState({ full_name: '', phone: '', password: '', confirm_password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next || '/'} replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (f.full_name.trim().length < 2) errs.full_name = 'Shkruaj emrin e plotë';
    if (f.phone.replace(/\D/g, '').length < 8) errs.phone = 'Shkruaj një numër telefoni të vlefshëm';
    if (f.password.length < 6) errs.password = 'Së paku 6 shkronja';
    if (f.confirm_password !== f.password) errs.confirm_password = 'Fjalëkalimet nuk përputhen';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register(f);
      track('login', `Created account as ${f.full_name.trim()}`);
      nav(next || '/', { replace: true });
    } catch (err) {
      setError(customerError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell back>
      <h2>Krijo llogarinë</h2>
      <p className="muted">Një hap larg porosisë së parë</p>
      <form onSubmit={submit} noValidate>
        <Field label="Emri i plotë" icon="user" autoComplete="name" value={f.full_name} onChange={set('full_name')} error={errors.full_name} maxLength={80} />
        <Field label="Numri i telefonit" icon="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="044 123 456" value={f.phone} onChange={set('phone')} error={errors.phone} />
        <Field label="Fjalëkalimi" icon="power" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} />
        <Field label="Përsërit fjalëkalimin" icon="power" type="password" autoComplete="new-password" value={f.confirm_password} onChange={set('confirm_password')} error={errors.confirm_password} />
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary btn-xl" disabled={busy}>
          {busy ? 'Po krijohet llogaria…' : 'Krijo llogarinë'} <Icon name="right" />
        </button>
      </form>
      <p className="auth-small">
        Ke llogari? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Hyr</Link>
      </p>
    </AuthShell>
  );
}

export function Forgot() {
  const { config } = useConfig();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot', { method: 'POST', body: { phone } });
      setSent(true);
    } catch (err) {
      setError(customerError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell back>
      <h2>Harruat fjalëkalimin</h2>
      {sent ? (
        <>
          <p className="muted">
            E morëm kërkesën. VND të telefonon ose të shkruan në këtë numër me një fjalëkalim të përkohshëm
            {config?.open_now ? ' së shpejti' : ' gjatë orarit'}.
          </p>
          {config?.business_phone && (
            <a className="btn btn-outline btn-block" href={`tel:${config.business_phone}`}>
              <Icon name="phone" size={18} /> Telefono VND
            </a>
          )}
          <Link to="/login" className="btn btn-primary btn-block">
            Kthehu te hyrja
          </Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="muted">Shkruaj numrin e telefonit. Të kontaktojmë me një fjalëkalim të përkohshëm.</p>
          <Field label="Numri i telefonit" icon="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ErrorBox>{error}</ErrorBox>
          <button className="btn btn-primary btn-xl" disabled={busy || !phone}>
            Dërgo kërkesën
          </button>
        </form>
      )}
    </AuthShell>
  );
}
