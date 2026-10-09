import { Empty, Spinner } from '../components/ui';
import type { OrderStatus } from '../types';
import { useAdmin } from './AdminContext';
import { CapacityCard, GpsPanel, OrderCard } from './components';

const ORDER: OrderStatus[] = ['PENDING', 'ON_THE_WAY', 'PURCHASED', 'PURCHASING', 'ACCEPTED'];

export default function Orders() {
  const { orders, loaded } = useAdmin();
  const sorted = [...orders].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.id - b.id);
  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <h1>Active orders</h1>
      </div>
      <div className="orders-top">
        <CapacityCard />
        <GpsPanel compact />
      </div>
      {!loaded ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <Empty icon="list" title="No active orders">
          <p>New orders appear here instantly with a sound alert.</p>
        </Empty>
      ) : (
        <div className="orders-grid">
          {sorted.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}
