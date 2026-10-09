import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Logo, LogoMark } from '../components/Logo';
import { Spinner } from '../components/ui';
import { clock } from '../lib/format';
import { useStreamConnected } from '../lib/stream';
import { useAuth } from '../state/auth';
import { AdminProvider, useAdmin } from './AdminContext';
import { NewOrderAlert } from './components';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/admin/orders', label: 'Orders', icon: 'list' },
  { to: '/admin/drive', label: 'Drive', icon: 'steering' },
  { to: '/admin/map', label: 'Map', icon: 'map' },
  { to: '/admin/history', label: 'History', icon: 'history' },
  { to: '/admin/revenue', label: 'Revenue', icon: 'chart' },
  { to: '/admin/products', label: 'Products', icon: 'bag' },
  { to: '/admin/announcements', label: 'Announcements', icon: 'megaphone' },
  { to: '/admin/visitors', label: 'Visitors', icon: 'eye' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];
const TAB_LABELS = ['Dashboard', 'Orders', 'Drive', 'Revenue'];

function Clock() {
  const [now, setNow] = useState(clock());
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 10000);
    return () => clearInterval(id);
  }, []);
  return <span className="adm-clock">{now}</span>;
}

function Shell() {
  const { orders, state, settings, gps, soundReady, enableSound, resetRequests, visitorLive } = useAdmin();
  const live = useStreamConnected();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = NAV.some((n) => !TAB_LABELS.includes(n.label) && pathname.startsWith(n.to));
  const pending = orders.filter((o) => o.status === 'PENDING').length;
  const online = settings?.business_online !== false;
  const gpsFailed = gps.status === 'denied' || gps.status === 'insecure' || gps.status === 'unsupported';

  return (
    <div className="admin" lang="en">
      <aside className="adm-side">
        <div className="adm-brand">
          <Logo size="sm" />
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
              {n.label === 'Orders' && orders.length > 0 && <em className={pending ? 'hot' : ''}>{orders.length}</em>}
              {n.label === 'Visitors' && visitorLive > 0 && <em>{visitorLive}</em>}
              {n.label === 'Settings' && resetRequests > 0 && <em className="hot">{resetRequests}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <div>
            <span className={`dot ${online ? 'on' : 'off'}`} /> {online ? 'Online' : 'Offline'}
          </div>
          <div className="muted">
            <Icon name="pin" size={14} /> Viti, Kosovo
          </div>
          <div className="muted">
            <Icon name="clock" size={14} /> {settings ? `${settings.open_time}–${settings.close_time}` : '14:00–03:00'}
          </div>
          <NavLink to="/" className="muted">
            <Icon name="home" size={14} /> Customer site
          </NavLink>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-header">
          <NavLink to="/admin" className="adm-header-logo">
            <LogoMark height={20} />
          </NavLink>
          <Clock />
          <span className={`pill ${online ? 'pill-on' : 'pill-off'}`}>
            <i />
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className="adm-hours muted">{settings ? `${settings.open_time}–${settings.close_time}` : ''}</span>
          {state && (
            <span className={`cap-chip${state.active >= state.max ? ' full' : ''}`}>
              ACTIVE {state.active} / {state.max}
            </span>
          )}
          <span className={`gps-chip ${gpsFailed ? 'warn' : gps.sharing ? (gps.status === 'live' ? 'on' : 'warn') : 'off'}`} title="Driver GPS">
            <Icon name="gps" size={14} /> GPS {gpsFailed ? '!' : gps.sharing ? (gps.status === 'live' ? 'ON' : '!') : 'OFF'}
          </span>
          <span className={`live-chip ${live ? 'on' : 'off'}`} title={live ? 'Live updates connected' : 'Reconnecting…'}>
            <i /> {live ? 'LIVE' : 'RECONNECTING'}
          </span>
          <div className="adm-driver">
            <span className="avatar sm">
              <Icon name="user" size={16} />
            </span>
            <div>
              <b>{settings?.driver_name || 'Whitey'}</b>
              <span>Driver</span>
            </div>
          </div>
        </header>

        {!soundReady && settings?.sound_enabled !== false && (
          <button className="sound-banner" onClick={enableSound}>
            <Icon name="volume" size={18} /> Tap here to enable new-order sound alerts (required once per session by the browser)
          </button>
        )}
        {gps.status === 'denied' && (
          <div className="warn-banner">
            <Icon name="alert" size={18} /> GPS permission lost — customers cannot see your location. Allow location for this site and press START LOCATION SHARING.
          </div>
        )}
        {gps.status === 'insecure' && (
          <div className="warn-banner">
            <Icon name="alert" size={18} /> GPS is blocked because this page is not on HTTPS — customers cannot see your location.
          </div>
        )}

        <div className="adm-content">
          <Outlet />
        </div>
      </div>

      {moreOpen && (
        <div className="adm-more-backdrop" onClick={() => setMoreOpen(false)}>
          <nav className="adm-more" onClick={(e) => e.stopPropagation()}>
            {NAV.filter((n) => !TAB_LABELS.includes(n.label)).map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)}>
                <Icon name={n.icon} size={20} />
                <span>{n.label}</span>
                {n.label === 'Visitors' && visitorLive > 0 && <em>{visitorLive}</em>}
                {n.label === 'Settings' && resetRequests > 0 && <em className="hot">{resetRequests}</em>}
              </NavLink>
            ))}
            <NavLink to="/" onClick={() => setMoreOpen(false)}>
              <Icon name="home" size={20} />
              <span>Customer site</span>
            </NavLink>
          </nav>
        </div>
      )}

      <nav className="adm-tabbar">
        {NAV.filter((n) => TAB_LABELS.includes(n.label)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span className="nav-icon">
              <Icon name={n.icon} size={22} />
              {n.label === 'Orders' && orders.length > 0 && <span className={`cart-count${pending ? ' hot' : ''}`}>{orders.length}</span>}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <button className={moreActive || moreOpen ? 'active' : ''} onClick={() => setMoreOpen((v) => !v)}>
          <span className="nav-icon">
            <Icon name="menu" size={22} />
            {resetRequests > 0 ? (
              <span className="cart-count hot">{resetRequests}</span>
            ) : visitorLive > 0 ? (
              <span className="cart-count">{visitorLive}</span>
            ) : null}
          </span>
          <span>More</span>
        </button>
      </nav>

      <NewOrderAlert />
    </div>
  );
}

export default function AdminLayout() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role === 'partner') return <Navigate to="/partner" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <AdminProvider>
      <Shell />
    </AdminProvider>
  );
}
