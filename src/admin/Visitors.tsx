import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Empty, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { ago, dateTime, time } from '../lib/format';
import { usePolling, useStreamEvent } from '../lib/stream';
import { StatCard } from './components';

interface Visitor {
  id: string;
  created_at: string;
  last_seen: string;
  user_name: string;
  user_phone: string;
  device: string;
  last_path: string;
  last_label: string;
  last_kind: string;
  pages: number;
  clicks: number;
  live: boolean;
}

interface EventRow {
  id: number;
  at: string;
  kind: string;
  path: string;
  label: string;
}

interface VisitorsData {
  live: number;
  today: { visitors: number; pages: number; clicks: number; carts: number; checkouts: number };
  top_pages: { label: string; n: number }[];
  top_clicks: { label: string; n: number }[];
  visitors: Visitor[];
}

const KIND_ICON: Record<string, string> = {
  page: 'eye',
  click: 'nav',
  cart: 'bag',
  checkout: 'check',
  login: 'user',
};

function who(v: Visitor) {
  if (v.user_name) return v.user_name;
  return 'Guest';
}

function kindLabel(kind: string) {
  if (kind === 'page') return 'Opened';
  if (kind === 'click') return 'Tapped';
  if (kind === 'cart') return 'Basket';
  if (kind === 'checkout') return 'Order';
  if (kind === 'login') return 'Login';
  return kind;
}

function TopList({ title, rows, empty }: { title: string; rows: { label: string; n: number }[]; empty: string }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted pad">{empty}</p>
      ) : (
        <ul className="vis-top">
          {rows.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <b>{r.n}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Visitors() {
  const [data, setData] = useState<VisitorsData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ visitor: Visitor; events: EventRow[] } | null>(null);

  const load = useCallback(() => {
    api<VisitorsData>('/admin/visitors')
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(load, [load]);
  useStreamEvent(['visitors', 'reconnect'], load);
  usePolling(load, 8000);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api<{ visitor: Visitor; events: EventRow[] }>(`/admin/visitors/${encodeURIComponent(selected)}`)
      .then((r) => {
        if (!cancelled) setDetail(r);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, data?.live, data?.today.clicks, data?.today.pages]);

  const t = data?.today;
  const list = data?.visitors || [];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Visitors</h1>
          <p className="muted">Who is on the shop right now, what they opened, and what they tapped.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon="eye" label="On the site now" value={String(data?.live ?? 0)} sub="active in the last 5 min" tone="accent" />
        <StatCard icon="user" label="Unique today" value={String(t?.visitors ?? 0)} sub="phones / browsers" />
        <StatCard icon="nav" label="Page views today" value={String(t?.pages ?? 0)} />
        <StatCard icon="bag" label="Added to basket" value={String(t?.carts ?? 0)} sub={`${t?.clicks ?? 0} taps · ${t?.checkouts ?? 0} checkouts`} />
      </div>

      <div className="vis-split">
        <section className="panel vis-people">
          <h2 className="panel-title">
            People <span className="count">{list.length}</span>
          </h2>
          {!data ? (
            <Spinner />
          ) : list.length === 0 ? (
            <Empty icon="eye" title="No visitors yet">
              <p>Open the customer site on your phone and tap around — it will show up here.</p>
            </Empty>
          ) : (
            <ul className="vis-list">
              {list.map((v) => (
                <li key={v.id}>
                  <button type="button" className={`vis-row${selected === v.id ? ' on' : ''}`} onClick={() => setSelected(v.id)}>
                    <span className={`vis-dot${v.live ? ' on' : ''}`} />
                    <span className="vis-who">
                      <b>{who(v)}</b>
                      <span className="muted">
                        {v.user_phone || v.device || 'Guest'}
                        {v.user_phone && v.device ? ` · ${v.device}` : ''}
                      </span>
                    </span>
                    <span className="vis-last">
                      <span>{v.last_label || '—'}</span>
                      <span className="muted">{v.live ? 'now' : ago(v.last_seen)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel vis-detail">
          <h2 className="panel-title">{detail ? who(detail.visitor) : 'Activity'}</h2>
          {!selected ? (
            <p className="muted pad">Pick a visitor to see every page they opened and every tap.</p>
          ) : !detail ? (
            <Spinner />
          ) : (
            <>
              <p className="muted vis-meta">
                {detail.visitor.device || 'Browser'}
                {detail.visitor.user_phone ? ` · ${detail.visitor.user_phone}` : ''}
                {` · first seen ${dateTime(detail.visitor.created_at)} · ${detail.visitor.pages} pages · ${detail.visitor.clicks} taps`}
              </p>
              {detail.events.length === 0 ? (
                <p className="muted pad">No steps stored for this visitor yet.</p>
              ) : (
                <ol className="vis-timeline">
                  {detail.events.map((e) => (
                    <li key={e.id}>
                      <span className={`vis-kind vis-kind-${e.kind}`}>
                        <Icon name={KIND_ICON[e.kind] || 'eye'} size={14} />
                        {kindLabel(e.kind)}
                      </span>
                      <div>
                        <b>{e.label}</b>
                        <span className="muted">
                          {time(e.at)} · {e.path}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>

      <div className="vis-grid">
        <TopList title="Top pages today" rows={data?.top_pages || []} empty="No page views yet today." />
        <TopList title="Top taps today" rows={data?.top_clicks || []} empty="No taps yet today." />
      </div>
    </div>
  );
}
