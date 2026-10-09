import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components/ui';
import Account from './customer/Account';
import { Forgot, Login, Register } from './customer/AuthPages';
import Basket from './customer/Basket';
import CustomerLayout from './customer/CustomerLayout';
import Home from './customer/Home';
import PartnerPage from './customer/PartnerPage';
import Shop from './customer/Shop';
import { VisitorTracker } from './lib/track';
import { AuthProvider, useAuth } from './state/auth';
import { CartProvider } from './state/cart';
import { ConfigProvider } from './state/config';

// Order/tracking pages and the whole admin area are code-split.
const Checkout = lazy(() => import('./customer/Checkout'));
const OrderPage = lazy(() => import('./customer/OrderPage'));
const TrackPage = lazy(() => import('./customer/TrackPage'));
const MyOrders = lazy(() => import('./customer/MyOrders'));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Dashboard = lazy(() => import('./admin/Dashboard'));
const Orders = lazy(() => import('./admin/Orders'));
const OrderDetail = lazy(() => import('./admin/OrderDetail'));
const Drive = lazy(() => import('./admin/Drive'));
const MapPage = lazy(() => import('./admin/MapPage'));
const History = lazy(() => import('./admin/History'));
const Revenue = lazy(() => import('./admin/Revenue'));
const Products = lazy(() => import('./admin/Products'));
const SettingsPage = lazy(() => import('./admin/SettingsPage'));
const Announcements = lazy(() => import('./admin/Announcements'));
const Visitors = lazy(() => import('./admin/Visitors'));
const PartnerLayout = lazy(() => import('./partner/PartnerLayout'));
const PartnerProducts = lazy(() => import('./partner/PartnerProducts'));

function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfigProvider>
          <CartProvider>
            <VisitorTracker />
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot" element={<Forgot />} />
                <Route element={<CustomerLayout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="p/:slug" element={<PartnerPage />} />
                  <Route path="basket" element={<Basket />} />
                  <Route path="account" element={<Account />} />
                  <Route path="checkout" element={<RequireUser><Checkout /></RequireUser>} />
                  <Route path="orders" element={<RequireUser><MyOrders /></RequireUser>} />
                  <Route path="orders/:number" element={<RequireUser><OrderPage /></RequireUser>} />
                  <Route path="orders/:number/track" element={<RequireUser><TrackPage /></RequireUser>} />
                </Route>
                <Route path="/partner" element={<PartnerLayout />}>
                  <Route index element={<PartnerProducts />} />
                </Route>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path="drive" element={<Drive />} />
                  <Route path="map" element={<MapPage />} />
                  <Route path="history" element={<History />} />
                  <Route path="revenue" element={<Revenue />} />
                  <Route path="products" element={<Products />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="announcements" element={<Announcements />} />
                  <Route path="visitors" element={<Visitors />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </CartProvider>
        </ConfigProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
