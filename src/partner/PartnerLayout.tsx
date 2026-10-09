import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { useAuth } from '../state/auth';

export default function PartnerLayout() {
  const { user, loading, logout } = useAuth();
  if (loading) return <Spinner label="Po ngarkohet…" />;
  if (!user) return <Navigate to="/login?next=/partner" replace />;
  if (user.role !== 'partner') return <Navigate to="/" replace />;

  return (
    <div className="admin" lang="sq">
      <aside className="adm-side">
        <div className="adm-brand">
          <b>Andi Market</b>
          <span className="muted">Paneli i produkteve</span>
        </div>
        <nav>
          <NavLink to="/partner" end>
            <Icon name="bag" size={20} />
            <span>Produktet</span>
          </NavLink>
        </nav>
        <div className="adm-side-foot">
          <div className="muted">{user.full_name}</div>
          <NavLink to="/p/andi" className="muted">
            <Icon name="home" size={14} /> Si e sheh klienti
          </NavLink>
          <button type="button" className="muted" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => logout()}>
            <Icon name="logout" size={14} /> Dil
          </button>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-header">
          <span className="adm-header-logo">Andi Market</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
