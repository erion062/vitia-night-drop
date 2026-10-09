import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ErrorBox, Map, Spinner, Timeline } from '../components/ui';
import { km, minutes, time } from '../lib/format';
import { useAge, useRoute } from '../lib/useRoute';
import { useConfig } from '../state/config';
import { SQ_STATUS, sqCancelReason } from './copy';
import { useCustomerOrder } from './useCustomerOrder';

const STALE_SECONDS = 45;

const HEADLINE: Record<string, string> = {
  PENDING: 'Po e presim konfirmimin',
  ACCEPTED: 'E pranuam — po niset',
  PURCHASING: 'Po i blejmë gjërat e tua',
  PURCHASED: 'U blenë — nisemi',
  ON_THE_WAY: 'Operatori po vjen te dera',
  DELIVERED: 'Të erdhi — kënaqu',
  CANCELLED: 'Porosia u anulua',
};

export default function TrackPage() {
  const { number = '' } = useParams();
  const nav = useNavigate();
  const { config } = useConfig();
  const { data, error, reload } = useCustomerOrder(number);
  const loc = data?.location || null;
  const age = useAge(loc?.updated_at, 3000);
  const stale = age !== null && age > STALE_SECONDS;
  const dest = data ? { lat: data.order.lat, lng: data.order.lng } : null;
  const showDriver = !!(data?.trackable && loc);
  const route = useRoute(showDriver && !stale ? loc : null, dest);

  if (error && !data) {
    return (
      <div className="page">
        <ErrorBox>{error}</ErrorBox>
        <p className="muted">Po provohet automatikisht kur shërbyesi të jetë gati.</p>
        <button className="btn btn-outline" type="button" onClick={reload}>
          Provo sërish
        </button>
        <Link to="/orders" className="btn btn-outline">
          Porositë e mia
        </Link>
      </div>
    );
  }
  if (!data || !dest) return <Spinner label="Ndjekja po ngarkohet…" />;
  const o = data.order;
  const onWay = o.status === 'ON_THE_WAY';
  const delivered = o.status === 'DELIVERED';

  return (
    <div className="track-page">
      <div className="track-map">
        <Map
          center={dest}
          driver={showDriver ? { pos: loc!, heading: loc!.heading, label: data.driver.name, sub: data.driver.vehicle, stale } : null}
          destination={{ pos: dest, label: 'Ti je këtu' }}
          route={showDriver && !stale && route ? route.coords : null}
          className="map-full"
          loadingLabel="Harta po ngarkohet…"
        />
        <button className="map-back" onClick={() => nav(`/orders/${o.number}`)} aria-label="Kthehu">
          <Icon name="left" size={22} />
        </button>
        <div className="map-order-chip">
          <span className="pulse" /> #{o.number} · {SQ_STATUS[o.status].toUpperCase()}
        </div>
      </div>

      <div className="track-sheet">
        <div className="sheet-handle" />
        <div className="track-head">
          <div className="track-head-icon">
            <Icon name={delivered ? 'check' : 'car'} size={24} />
          </div>
          <div>
            <h2>{HEADLINE[o.status]}</h2>
            <p>
              {delivered
                ? 'Kënaqu — faleminderit që zgjodhe VND.'
                : onWay && route && showDriver && !stale
                  ? `${data.driver.name} është në rrugë · ETA ${minutes(route.seconds)} · ${km(route.meters)}${route.approximate ? ' (përafërsisht)' : ''}`
                  : o.status === 'CANCELLED'
                    ? sqCancelReason(o.cancel_reason)
                    : `Dorëzimi i parashikuar ${time(o.eta_from)} – ${time(o.eta_to)}`}
            </p>
          </div>
        </div>

        {data.trackable && !loc && (
          <div className="loc-warn">
            <Icon name="gps" size={16} /> Lokacioni live del kur {data.driver.name} fillon ta ndajë.
          </div>
        )}
        {data.trackable && loc && stale && (
          <div className="loc-warn warn">
            <Icon name="alert" size={16} /> Lokacioni përkohësisht s’është i gatshëm · përditësimi i fundit {time(loc.updated_at)}
          </div>
        )}

        <Timeline order={o} compact />

        <div className="driver-card">
          <div className="driver-car">
            <Icon name="car" size={28} />
          </div>
          <div className="driver-info">
            <b>{data.driver.name}</b>
            <span>{data.driver.vehicle}</span>
            {showDriver && !stale && (
              <span className="live">
                <i /> Live
              </span>
            )}
          </div>
          {config?.business_phone && (
            <a className="round-btn" href={`tel:${config.business_phone}`} aria-label="Telefono VND">
              <Icon name="phone" size={20} />
            </a>
          )}
        </div>

        <Link to={`/orders/${o.number}`} className="btn btn-outline btn-block">
          Shiko detajet e porosisë <Icon name="right" size={16} />
        </Link>
      </div>
    </div>
  );
}
