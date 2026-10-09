import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/config';
import { TopBar } from './CustomerLayout';

type InstallEvent = Event & { prompt: () => Promise<void> };
let deferredPrompt: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as InstallEvent;
});

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);
  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (isStandalone()) return null;
  return (
    <div className="card install-card">
      <Icon name="download" size={22} />
      <div>
        <b>Shto VND në ekranin kryesor</b>
        {canPrompt ? (
          <span>Hapet si app — porosit më shpejt, pa shiritin e shfletuesit.</span>
        ) : isIos() ? (
          <span>
            Në Safari prek <b>Share</b> → <b>Add to Home Screen</b>.
          </span>
        ) : (
          <span>
            Hap menunë e shfletuesit → <b>Install app</b> / <b>Add to Home screen</b>.
          </span>
        )}
      </div>
      {canPrompt && (
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            await deferredPrompt?.prompt();
            deferredPrompt = null;
            setCanPrompt(false);
          }}
        >
          Instalo
        </button>
      )}
    </div>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const { config } = useConfig();
  const nav = useNavigate();
  return (
    <div className="page">
      <TopBar title="Llogaria" />
      {user ? (
        <section className="card account-card">
          <div className="avatar">
            <Icon name="user" size={26} />
          </div>
          <div>
            <b>{user.full_name}</b>
            <span>{user.phone}</span>
          </div>
        </section>
      ) : (
        <section className="card">
          <p>Hyr që të porositësh dhe t’i ndjekësh dorëzimet — operatori ta sjell tani, te dera.</p>
          <div className="btn-row">
            <Link to="/login" className="btn btn-primary">
              Hyr
            </Link>
            <Link to="/register" className="btn btn-outline">
              Krijo llogari
            </Link>
          </div>
        </section>
      )}

      <InstallCard />

      {user && (
        <nav className="card menu-list">
          <Link to="/orders">
            <Icon name="clock" /> Porositë e mia <Icon name="right" size={16} />
          </Link>
          {user.role === 'admin' && (
            <Link to="/admin">
              <Icon name="dashboard" /> Admin dashboard <Icon name="right" size={16} />
            </Link>
          )}
          {user.role === 'partner' && (
            <Link to="/partner">
              <Icon name="bag" /> Produktet e mia <Icon name="right" size={16} />
            </Link>
          )}
          {config?.business_phone && (
            <a href={`tel:${config.business_phone}`}>
              <Icon name="phone" /> Telefono VND <Icon name="right" size={16} />
            </a>
          )}
          <button
            onClick={async () => {
              await logout();
              nav('/');
            }}
          >
            <Icon name="logout" /> Dil <span />
          </button>
        </nav>
      )}

      <p className="fine-print">
        VITIA NIGHT DROP · Viti, Kosovë · {config ? `${config.open_time}–${config.close_time}` : '14:00–23:00'} · Pagesa në dorëzim
      </p>
    </div>
  );
}
