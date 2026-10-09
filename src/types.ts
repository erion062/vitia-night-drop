export type Role = 'customer' | 'admin' | 'partner';

export interface User {
  id: number;
  full_name: string;
  phone: string;
  role: Role;
  partner?: string;
}

export type Category = 'drinks' | 'food' | 'snacks' | 'cigarettes' | 'other';

export interface Product {
  id: number;
  name: string;
  description: string;
  category: Category;
  price_cents: number;
  cost_cents?: number;
  image_url: string;
  accent: string;
  available: boolean;
  popular: boolean;
  sort?: number;
  /** Partner slug when this item comes from a partner shop's menu. */
  partner?: string;
  /** Menu section inside a partner's page, e.g. "Pizza". */
  section?: string;
}

export interface Partner {
  slug: string;
  name: string;
  tagline: string;
  logo_url: string;
  hours: string;
  kind?: 'restaurant' | 'market' | 'bakery';
}

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PURCHASING'
  | 'PURCHASED'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface PublicConfig {
  business_name: string;
  business_phone: string;
  open_time: string;
  close_time: string;
  timezone: string;
  delivery_fee_cents: number;
  min_order_cents: number;
  max_active_orders: number;
  driver_name: string;
  vehicle_name: string;
  base_lat: number;
  base_lng: number;
  service_radius_km: number;
  online: boolean;
  open_now: boolean;
  accepting_orders: boolean;
  reason: 'OFFLINE' | 'CLOSED' | 'BUSY' | null;
  reason_message: string;
  active_orders: number;
  simulation: boolean;
  osrm_url: string;
  map_tiles: MapTiles;
  announcements: Announcement[];
}

export type AnnouncementTone = 'promo' | 'info' | 'warning';

export interface Announcement {
  id: number;
  message: string;
  tone: AnnouncementTone;
  expires_at: string | null;
  created_at?: string;
  removed_at?: string | null;
  active?: boolean;
}

export interface MapTiles {
  url: string;
  attribution: string;
  dark_filter: boolean;
}

export interface OrderItem {
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  unit_cost_cents?: number;
  category?: string;
}

export interface HistoryEntry {
  status: OrderStatus;
  created_at: string;
  note?: string;
}

export interface CustomerOrder {
  number: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
  lat: number;
  lng: number;
  payment_method: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  discount_label: string;
  total_cents: number;
  eta_from: string | null;
  eta_to: string | null;
  cancel_reason: string;
  created_at: string;
  accepted_at: string | null;
  purchasing_at: string | null;
  purchased_at: string | null;
  on_the_way_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  items: OrderItem[];
  history?: HistoryEntry[];
}

export interface AdminOrder extends CustomerOrder {
  id: number;
  user_id: number;
  cost_cents: number;
  fuel_cost_cents: number;
  cash_received_cents: number | null;
  product_profit_cents: number;
  net_profit_cents: number;
  updated_at: string;
}

export type DiscountInput = { type: 'percent' | 'amount'; value: number } | { type: 'free_delivery' } | null;

export interface PaymentInput {
  discount: DiscountInput;
  cash_received_cents: number | null;
}

export interface DriverLocation {
  lat: number;
  lng: number;
  heading: number | null;
  accuracy: number | null;
  speed?: number | null;
  updated_at: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OrderingState {
  accepting: boolean;
  reason: string | null;
  active: number;
  max: number;
  openNow: boolean;
}

export interface Settings {
  business_name: string;
  business_phone: string;
  open_time: string;
  close_time: string;
  delivery_fee_cents: number;
  min_order_cents: number;
  max_active_orders: number;
  max_active_per_customer: number;
  driver_name: string;
  vehicle_name: string;
  location_sharing_enabled: boolean;
  sound_enabled: boolean;
  business_online: boolean;
  fuel_cost_cents: number;
  base_lat: number;
  base_lng: number;
  service_radius_km: number;
}
