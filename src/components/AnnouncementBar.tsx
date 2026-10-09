import { useEffect, useState } from 'react';
import type { Announcement } from '../types';
import { Icon } from './Icon';

const DISMISSED_KEY = 'vnd_dismissed_ann';
const ICON = { promo: 'tag', info: 'megaphone', warning: 'alert' } as const;

function loadDismissed(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function AnnouncementBar({ items, preview }: { items: Announcement[]; preview?: boolean }) {
  const [dismissed, setDismissed] = useState<number[]>(preview ? [] : loadDismissed);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const visible = items.filter((a) => !dismissed.includes(a.id) && (!a.expires_at || new Date(a.expires_at).getTime() > now));

  useEffect(() => {
    if (visible.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), 6000);
    return () => clearInterval(id);
  }, [visible.length]);

  if (visible.length === 0) return null;
  const a = visible[index % visible.length];

  function dismiss() {
    const next = [...dismissed, a.id].slice(-50);
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  }

  return (
    <div className={`ann-bar tone-${a.tone}`} role="status">
      <Icon name={ICON[a.tone]} size={18} />
      <p key={a.id}>{a.message}</p>
      {visible.length > 1 && (
        <span className="ann-count">
          {(index % visible.length) + 1}/{visible.length}
        </span>
      )}
      {!preview && (
        <button className="ann-close" onClick={dismiss} aria-label="Mbyll njoftimin">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
