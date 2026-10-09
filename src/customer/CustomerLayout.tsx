import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnnouncementBar } from '../components/AnnouncementBar';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';

export function StatusPill({ reason, online }: { reason: string | null | undefined; online?: boolean }) {
  if (online === undefined && reason == null) return <span className="pill pill-off"><i />PO LIDHET</span>;
  if (!reason && online !== false) return <span className="pill pill-on"><i />HAPUR</span>;
  if (reason === 'BUSY') return <span className="pill pill-busy"><i />I ZËNË</span>;
  if (reason === 'CLOSED') return <span className="pill pill-off"><i />MBYLLUR</span>;
  return <span className="pill pill-off"><i />OFFLINE</span>;
}

export function TopBar({ title, back }: { title?: string; back?: boolean }) {
  const nav = useNavigate();
  const { count } = useCart();
  return (
    <header className="topbar">
      {back ? (
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Kthehu">
          <Icon name="left" size={22} />
        </button>
      ) : (
        <NavLink to="/" className="topbar-logo" aria-label="VND — faqja kryesore">
          <LogoMark height={22} />
        </NavLink>
      )}
      {title && <h1 className="topbar-title">{title}</h1>}
      <NavLink to="/basket" className="icon-btn cart-btn" aria-label="Shporta">
        <Icon name="cart" size={22} />
        {count > 0 && <span className="cart-count">{count}</span>}
      </NavLink>
    </header>
  );
}

export default function CustomerLayout() {
  const { count } = useCart();
  const { config, error, refreshConfig, refreshProducts } = useConfig();
  const { pathname } = useLocation();
  const hideNav = pathname.endsWith('/track') || pathname === '/checkout';
  return (
    <div className={`app-shell${hideNav ? '' : ' has-nav'}`}>
      {error && !config && (
        <div className="notice notice-off conn-banner">
          <Icon name="alert" size={20} />
          <div>
            <b>S’ka lidhje me VND</b>
            <span>{error} Po provohet automatikisht.</span>
          </div>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              refreshConfig();
              refreshProducts();
            }}
          >
            Provo sërish
          </button>
        </div>
      )}
      {config?.announcements && config.announcements.length > 0 && <AnnouncementBar items={config.announcements} />}
      <main className="app-main">
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            <Icon name="home" size={22} />
            <span>Ballina</span>
          </NavLink>
          <NavLink to="/shop">
            <Icon name="search" size={22} />
            <span>Dyqani</span>
          </NavLink>
          <NavLink to="/basket">
            <span className="nav-icon">
              <Icon name="cart" size={22} />
              {count > 0 && <span className="cart-count">{count}</span>}
            </span>
            <span>Shporta</span>
          </NavLink>
          <NavLink to="/orders">
            <Icon name="clock" size={22} />
            <span>Porositë</span>
          </NavLink>
          <NavLink to="/account">
            <Icon name="user" size={22} />
            <span>Llogaria</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
