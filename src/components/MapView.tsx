import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, MapTiles } from '../types';
import { getMapTiles, onMapTiles } from '../lib/geo';
import { Icon } from './Icon';

export interface DriverMarker {
  pos: LatLng;
  heading?: number | null;
  label: string;
  sub?: string;
  stale?: boolean;
}

export interface PlaceMarker {
  id?: string | number;
  pos: LatLng;
  label: string;
  sub?: string;
  highlight?: boolean;
  onClick?: () => void;
}

export interface ServiceArea {
  center: LatLng;
  radiusKm: number;
  label?: string;
  /** Makes the area editable: tap the map or drag the centre marker to move it. */
  onMove?: (center: LatLng) => void;
}

interface Props {
  center: LatLng;
  zoom?: number;
  driver?: DriverMarker | null;
  destination?: PlaceMarker | null;
  places?: PlaceMarker[];
  route?: LatLng[] | null;
  picker?: { value: LatLng | null; onChange: (pos: LatLng) => void };
  serviceArea?: ServiceArea | null;
  className?: string;
}

interface AreaLayers {
  ring: L.Circle;
  inner: L.Circle[];
  sweep: L.Marker;
  center: L.Marker;
  editable: boolean;
  label?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CAR_SVG = `<svg viewBox="0 0 24 40" width="22" height="36"><rect x="3" y="2" width="18" height="36" rx="7" fill="#d8d8d8" stroke="#00FF66" stroke-width="1.5"/><rect x="6" y="9" width="12" height="7" rx="2" fill="#1b1b1b"/><rect x="6" y="27" width="12" height="5" rx="2" fill="#1b1b1b"/><rect x="5" y="3" width="4" height="2" rx="1" fill="#fff8c0"/><rect x="15" y="3" width="4" height="2" rx="1" fill="#fff8c0"/></svg>`;

function driverIcon(d: DriverMarker) {
  return L.divIcon({
    className: 'map-icon car-icon',
    iconSize: [0, 0],
    html: `<div class="car-marker${d.stale ? ' stale' : ''}">
      <div class="car-body" style="transform: rotate(${Math.round(d.heading ?? 0)}deg)">${CAR_SVG}</div>
      <div class="marker-label"><b>${esc(d.label)}</b>${d.sub ? `<span>${esc(d.sub)}</span>` : ''}</div>
    </div>`,
  });
}

function placeIcon(p: PlaceMarker, kind: 'dest' | 'place') {
  return L.divIcon({
    className: 'map-icon',
    iconSize: [0, 0],
    html: `<div class="pin-marker ${kind}${p.highlight ? ' hl' : ''}">
      <div class="pin"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div>
      <div class="marker-label"><b>${esc(p.label)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}</div>
    </div>`,
  });
}

function areaCenterIcon(label: string | undefined, editable: boolean) {
  return L.divIcon({
    className: 'map-icon',
    iconSize: [0, 0],
    html: `<div class="area-center${editable ? ' editable' : ''}">
      <span class="area-ping"></span><span class="area-dot"></span>
      ${label ? `<div class="marker-label"><b>${esc(label)}</b></div>` : ''}
    </div>`,
  });
}

const SWEEP_ICON = L.divIcon({ className: 'map-icon area-sweep-icon', iconSize: [0, 0], html: '<div class="area-sweep"></div>' });

export default function MapView({ center, zoom = 15, driver, destination, places, route, picker, serviceArea, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{
    driver?: L.Marker;
    dest?: L.Marker;
    places: L.Marker[];
    routeGlow?: L.Polyline;
    routeLine?: L.Polyline;
    picker?: L.Marker;
    area?: AreaLayers;
  }>({ places: [] });
  const follow = useRef(true);
  const [showRecenter, setShowRecenter] = useState(false);
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const areaRef = useRef(serviceArea);
  areaRef.current = serviceArea;

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
    let tiles: L.TileLayer | null = null;
    const applyTiles = (t: MapTiles) => {
      tiles?.remove();
      tiles = L.tileLayer(t.url, { maxZoom: 19, attribution: t.attribution }).addTo(m);
      el.current?.classList.toggle('dark-tiles', t.dark_filter);
    };
    const initial = getMapTiles();
    if (initial) applyTiles(initial);
    const offTiles = onMapTiles(applyTiles);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.on('dragstart', () => {
      follow.current = false;
      setShowRecenter(true);
    });
    m.on('zoomstart', () => el.current?.classList.add('no-anim'));
    m.on('zoomend', () => {
      sizeSweep();
      setTimeout(() => el.current?.classList.remove('no-anim'), 50);
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      pickerRef.current?.onChange(p);
      areaRef.current?.onMove?.(p);
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      offTiles();
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = { places: [] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sizeSweep() {
    const m = map.current;
    const a = layers.current.area;
    const node = a?.sweep.getElement()?.firstElementChild as HTMLElement | null | undefined;
    if (!m || !a || !node) return;
    const b = a.ring.getBounds();
    const px = Math.round(m.latLngToLayerPoint(b.getNorthEast()).x - m.latLngToLayerPoint(b.getSouthWest()).x);
    node.style.width = node.style.height = `${px}px`;
    node.style.display = px > 2400 || px < 16 ? 'none' : '';
  }

  // Service area (delivery radius radar)
  const editable = !!serviceArea?.onMove;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const l = layers.current;
    if (l.area && (!serviceArea || l.area.editable !== editable || l.area.label !== serviceArea.label)) {
      [l.area.ring, ...l.area.inner, l.area.sweep, l.area.center].forEach((x) => x.remove());
      l.area = undefined;
    }
    if (!serviceArea) return;
    const c: [number, number] = [serviceArea.center.lat, serviceArea.center.lng];
    const r = serviceArea.radiusKm * 1000;
    const created = !l.area;
    if (!l.area) {
      const ring = L.circle(c, { radius: r, color: '#00FF66', weight: 1.5, opacity: 0.85, fillColor: '#00FF66', fillOpacity: 0.05, interactive: false }).addTo(m);
      const inner = [1 / 3, 2 / 3].map((f) =>
        L.circle(c, { radius: r * f, color: '#00FF66', weight: 1, opacity: 0.28, dashArray: '3 7', fill: false, interactive: false }).addTo(m),
      );
      const sweep = L.marker(c, { icon: SWEEP_ICON, interactive: false, keyboard: false, pane: 'overlayPane' }).addTo(m);
      const center = L.marker(c, {
        icon: areaCenterIcon(serviceArea.label, editable),
        draggable: editable,
        interactive: editable,
        keyboard: false,
        zIndexOffset: -500,
      }).addTo(m);
      const moveAll = (ll: L.LatLng) => [ring, ...inner, sweep].forEach((x) => x.setLatLng(ll));
      center.on('drag', () => moveAll(center.getLatLng()));
      center.on('dragend', () => {
        const p = center.getLatLng();
        areaRef.current?.onMove?.({ lat: p.lat, lng: p.lng });
      });
      l.area = { ring, inner, sweep, center, editable, label: serviceArea.label };
    } else {
      const a = l.area;
      const radiusChanged = Math.abs(a.ring.getRadius() - r) > 1;
      [a.ring, ...a.inner, a.sweep, a.center].forEach((x) => x.setLatLng(c));
      a.ring.setRadius(r);
      a.inner.forEach((x, i) => x.setRadius((r * (i + 1)) / 3));
      if (editable && radiusChanged) {
        const view = m.getBounds();
        const b = a.ring.getBounds();
        const tooSmall = b.getNorthEast().lat - b.getSouthWest().lat < (view.getNorth() - view.getSouth()) * 0.3;
        if (!view.contains(b) || tooSmall) m.fitBounds(b, { padding: [24, 24], animate: false });
      }
    }
    sizeSweep();
    if (created && follow.current) fit();
  }, [serviceArea?.center.lat, serviceArea?.center.lng, serviceArea?.radiusKm, serviceArea?.label, editable, !!serviceArea]); // eslint-disable-line react-hooks/exhaustive-deps

  // Driver marker
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const l = layers.current;
    if (!driver) {
      l.driver?.remove();
      l.driver = undefined;
      return;
    }
    if (!l.driver) l.driver = L.marker([driver.pos.lat, driver.pos.lng], { icon: driverIcon(driver), zIndexOffset: 1000 }).addTo(m);
    else {
      l.driver.setLatLng([driver.pos.lat, driver.pos.lng]);
      l.driver.setIcon(driverIcon(driver));
    }
  }, [driver?.pos.lat, driver?.pos.lng, driver?.heading, driver?.stale, driver?.label, driver?.sub, driver]);

  // Destination marker
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const l = layers.current;
    l.dest?.remove();
    l.dest = destination ? L.marker([destination.pos.lat, destination.pos.lng], { icon: placeIcon(destination, 'dest') }).addTo(m) : undefined;
  }, [destination?.pos.lat, destination?.pos.lng, destination?.label, destination?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Other places (admin map: all active customers)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.places.forEach((p) => p.remove());
    layers.current.places = (places || []).map((p) => {
      const mk = L.marker([p.pos.lat, p.pos.lng], { icon: placeIcon(p, 'place') }).addTo(m);
      if (p.onClick) mk.on('click', p.onClick);
      return mk;
    });
  }, [places]);

  // Route line
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const l = layers.current;
    l.routeGlow?.remove();
    l.routeLine?.remove();
    l.routeGlow = l.routeLine = undefined;
    if (route && route.length > 1) {
      const pts = route.map((p) => [p.lat, p.lng] as [number, number]);
      l.routeGlow = L.polyline(pts, { color: '#00FF66', weight: 12, opacity: 0.18, interactive: false }).addTo(m);
      l.routeLine = L.polyline(pts, { color: '#00FF66', weight: 4, opacity: 0.95, interactive: false }).addTo(m);
    }
  }, [route]);

  // Location picker (checkout)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const l = layers.current;
    const v = picker?.value;
    if (!v) {
      l.picker?.remove();
      l.picker = undefined;
      return;
    }
    if (!l.picker) {
      l.picker = L.marker([v.lat, v.lng], {
        draggable: true,
        icon: placeIcon({ pos: v, label: 'Te dera' }, 'dest'),
      }).addTo(m);
      l.picker.on('dragend', () => {
        const p = l.picker!.getLatLng();
        pickerRef.current?.onChange({ lat: p.lat, lng: p.lng });
      });
    } else l.picker.setLatLng([v.lat, v.lng]);
    if (follow.current) m.setView([v.lat, v.lng], Math.max(m.getZoom(), 16), { animate: true });
  }, [picker?.value?.lat, picker?.value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep driver + destination in view while following.
  const fitKey = [driver?.pos.lat, driver?.pos.lng, destination?.pos.lat, destination?.pos.lng].map((n) => n?.toFixed(4)).join();
  useEffect(() => {
    if (follow.current) fit();
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function fit() {
    const m = map.current;
    if (!m) return;
    const pts: [number, number][] = [];
    if (driver) pts.push([driver.pos.lat, driver.pos.lng]);
    if (destination) pts.push([destination.pos.lat, destination.pos.lng]);
    if (picker?.value) pts.push([picker.value.lat, picker.value.lng]);
    if (pts.length === 0) (places || []).forEach((p) => pts.push([p.pos.lat, p.pos.lng]));
    if (pts.length >= 2) m.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 17 });
    else if (pts.length === 1) m.setView(pts[0], 16);
    else if (layers.current.area) m.fitBounds(layers.current.area.ring.getBounds(), { padding: [24, 24] });
  }

  return (
    <div className={`map-wrap ${className || ''}`}>
      <div ref={el} className="map" />
      {showRecenter && (
        <button
          type="button"
          className="map-recenter"
          onClick={() => {
            follow.current = true;
            setShowRecenter(false);
            fit();
          }}
          aria-label="Recenter map"
        >
          <Icon name="nav" size={18} />
        </button>
      )}
    </div>
  );
}
