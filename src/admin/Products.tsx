import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { CATEGORY_META, ErrorBox, ProductImage, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { euro } from '../lib/format';
import { useConfig } from '../state/config';
import type { Category, Product } from '../types';

const EMPTY: Product = {
  id: 0,
  name: '',
  description: '',
  category: 'drinks',
  price_cents: 0,
  cost_cents: 0,
  image_url: '',
  accent: '#00FF66',
  available: true,
  popular: false,
};

/** Resize to max 600 px WebP in the browser so uploads stay small on 4G. */
async function resizeImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.') || '0') * 100);

function ProductForm({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(product);
  const [price, setPrice] = useState(product.id ? (product.price_cents / 100).toFixed(2) : '');
  const [cost, setCost] = useState(product.id ? ((product.cost_cents || 0) / 100).toFixed(2) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const data = await resizeImage(file);
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: { data } });
      setP((x) => ({ ...x, image_url: r.url }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const body = {
      name: p.name,
      description: p.description,
      category: p.category,
      price_cents: toCents(price),
      cost_cents: toCents(cost),
      image_url: p.image_url,
      accent: p.accent,
      available: p.available,
      popular: p.popular,
    };
    if (!body.name.trim()) return setError('Name is required');
    if (!(body.price_cents > 0)) return setError('Enter a sale price');
    setBusy(true);
    try {
      if (p.id) await api(`/admin/products/${p.id}`, { method: 'PUT', body });
      else await api('/admin/products', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const margin = toCents(price) - toCents(cost);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          <h2>{p.id ? 'Edit product' : 'Add product'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="img-edit">
          <ProductImage product={p} size={96} />
          <div>
            <label className="btn btn-outline btn-sm">
              <Icon name="image" size={16} /> {p.image_url ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {p.image_url && (
              <button type="button" className="link-danger" onClick={() => setP({ ...p, image_url: '' })}>
                Remove photo
              </button>
            )}
            <label className="inline">
              Tile colour <input type="color" value={p.accent} onChange={(e) => setP({ ...p, accent: e.target.value })} />
            </label>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={80} />
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <input className="input" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} maxLength={200} />
        </label>
        <label className="field">
          <span className="field-label">Category</span>
          <select className="input" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as Category })}>
            {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </label>
        <div className="two-col">
          <label className="field">
            <span className="field-label">Sale price (€)</span>
            <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.80" />
          </label>
          <label className="field">
            <span className="field-label">Purchase cost (€, estimate)</span>
            <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="1.30" />
          </label>
        </div>
        <p className="hint">Margin per item: {euro(margin)} — used for profit estimates only, never shown to customers.</p>
        <label className="toggle-row">
          <input type="checkbox" checked={p.available} onChange={(e) => setP({ ...p, available: e.target.checked })} />
          <span>Available to order</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={p.popular} onChange={(e) => setP({ ...p, popular: e.target.checked })} />
          <span>Show in “Popular right now”</span>
        </label>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Saving…' : 'Save product'}
        </button>
      </form>
    </div>
  );
}

export default function Products() {
  const { refreshProducts, partners } = useConfig();
  const [from, setFrom] = useState('all');
  const partnerName = (slug?: string) => partners.find((x) => x.slug === slug)?.name || slug;
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ products: Product[] }>('/admin/products')
      .then((r) => setProducts(r.products))
      .catch((e) => setError(errorMessage(e)));
    refreshProducts();
  }, [refreshProducts]);
  useEffect(load, [load]);

  async function patch(p: Product, body: Partial<Product>) {
    setProducts((list) => list?.map((x) => (x.id === p.id ? { ...x, ...body } : x)) || null);
    try {
      await api(`/admin/products/${p.id}`, { method: 'PUT', body });
      refreshProducts();
    } catch (e) {
      setError(errorMessage(e));
      load();
    }
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? Past orders keep their item names.`)) return;
    try {
      await api(`/admin/products/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const list = (products || [])
    .filter((p) => cat === 'all' || p.category === cat)
    .filter((p) => from === 'all' || (from === 'vnd' ? !p.partner : p.partner === from));

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">Catalog only — VND buys items after each order. Toggle availability when a shop is out of something.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(EMPTY)}>
          <Icon name="plus" size={18} /> Add product
        </button>
      </div>
      <div className="chips">
        {(['all', ...Object.keys(CATEGORY_META)] as (Category | 'all')[]).map((c) => (
          <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
            {c === 'all' ? 'All' : CATEGORY_META[c].label}
          </button>
        ))}
      </div>
      {partners.length > 0 && (
        <div className="chips">
          {[['all', 'All sources'], ['vnd', 'VND stock'], ...partners.map((x) => [x.slug, x.name])].map(([id, label]) => (
            <button key={id} className={`chip${from === id ? ' on' : ''}`} onClick={() => setFrom(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
      {!products ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="table products-table">
            <thead>
              <tr>
                <th />
                <th>Product</th>
                <th>Category</th>
                <th className="r">Sale price</th>
                <th className="r">Purchase cost</th>
                <th className="r">Margin</th>
                <th>Available</th>
                <th>Popular</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.available ? '' : 'dim'}>
                  <td>
                    <ProductImage product={p} size={40} />
                  </td>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted small">
                      {[p.partner && `${partnerName(p.partner)} · ${p.section}`, p.description].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td>{CATEGORY_META[p.category].label}</td>
                  <td className="r">{euro(p.price_cents)}</td>
                  <td className="r muted">{euro(p.cost_cents || 0)}</td>
                  <td className="r accent">{euro(p.price_cents - (p.cost_cents || 0))}</td>
                  <td>
                    <button className={`switch${p.available ? ' on' : ''}`} onClick={() => patch(p, { available: !p.available })} aria-label="Toggle availability">
                      <i />
                    </button>
                  </td>
                  <td>
                    <button className={`switch${p.popular ? ' on' : ''}`} onClick={() => patch(p, { popular: !p.popular })} aria-label="Toggle popular">
                      <i />
                    </button>
                  </td>
                  <td className="nowrap">
                    <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Edit">
                      <Icon name="edit" size={18} />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Delete">
                      <Icon name="trash" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProductForm
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
