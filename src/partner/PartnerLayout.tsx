import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../state/auth';
import type { Partner } from '../types';

export default function PartnerLayout() {
  const { user, loading, logout } = useAuth();
  const [shop, setShop] = useState<Partner | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'partner') return;
    api<{ shop: Partner }>('/partner/me')
      .then((r) => setShop(r.shop))
      .catch(() => {});
  }, [user]);

  if (loading) return <Spinner label="Po ngarkohet…" />;
  if (!user) return <Navigate to="/login?next=/partner" replace />;
  if (user.role !== 'partner') return <Navigate to="/" replace />;

  const name = shop?.name || user.full_name || 'Partneri';
  const slug = shop?.slug || user.partner || '';

  return (
    <div className="admin" lang="sq">
      <aside className="adm-side">
        <div className="adm-brand">
          {shop?.logo_url ? <img src={shop.logo_url} alt="" className="adm-brand-logo" /> : null}
          <b>{name}</b>
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
          {slug && (
            <NavLink to={`/p/${slug}`} className="muted">
              <Icon name="home" size={14} /> Si e sheh klienti
            </NavLink>
          )}
          <button type="button" className="muted" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => logout()}>
            <Icon name="logout" size={14} /> Dil
          </button>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-header">
          <span className="adm-header-logo">{name}</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
