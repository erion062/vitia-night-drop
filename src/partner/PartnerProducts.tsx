import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { CATEGORY_META, ErrorBox, ProductImage, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { euro } from '../lib/format';
import { useConfig } from '../state/config';
import type { Category, Partner, Product } from '../types';

function emptyProduct(shop: Partner | null): Product {
  const bakery = shop?.kind === 'bakery';
  return {
    id: 0,
    name: '',
    description: '',
    category: bakery ? 'food' : 'other',
    price_cents: 0,
    image_url: '',
    accent: bakery ? '#C4A35A' : '#00FF66',
    available: true,
    popular: false,
    section: bakery ? 'Bukë' : shop?.kind === 'restaurant' ? 'Menu' : 'Market',
  };
}

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

function Form({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(product);
  const [price, setPrice] = useState(product.id ? (product.price_cents / 100).toFixed(2) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const data = await resizeImage(file);
      const r = await api<{ url: string }>('/partner/uploads', { method: 'POST', body: { data } });
      setP((x) => ({ ...x, image_url: r.url }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: p.name,
      description: p.description,
      section: p.section || 'Market',
      category: p.category,
      price_cents: toCents(price),
      image_url: p.image_url,
      available: p.available,
    };
    if (!body.name.trim()) return setError('Shkruaj emrin e produktit');
    if (!(body.price_cents > 0)) return setError('Shkruaj çmimin');
    setBusy(true);
    setError('');
    try {
      if (p.id) await api(`/partner/products/${p.id}`, { method: 'PUT', body });
      else await api('/partner/products', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          <h2>{p.id ? 'Ndrysho produktin' : 'Shto produkt'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Mbyll">
            <Icon name="x" />
          </button>
        </div>
        <div className="img-edit">
          <ProductImage product={p} size={96} />
          <div>
            <label className="btn btn-outline btn-sm">
              <Icon name="image" size={16} /> {p.image_url ? 'Ndrysho foton' : 'Ngarko foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {p.image_url && (
              <button type="button" className="link-danger" onClick={() => setP({ ...p, image_url: '' })}>
                Hiq foton
              </button>
            )}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Emri</span>
          <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={80} />
        </label>
        <label className="field">
          <span className="field-label">Përshkrimi (opsionale)</span>
          <input className="input" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} maxLength={200} />
        </label>
        <label className="field">
          <span className="field-label">Seksioni në faqe</span>
          <input className="input" value={p.section || ''} onChange={(e) => setP({ ...p, section: e.target.value })} placeholder="p.sh. Pije, Ushqim, Higjienë" maxLength={40} />
        </label>
        <label className="field">
          <span className="field-label">Kategoria</span>
          <select className="input" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as Category })}>
            {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].sq}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Çmimi (€)</span>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1.20" />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={p.available} onChange={(e) => setP({ ...p, available: e.target.checked })} />
          <span>I disponueshëm për porosi</span>
        </label>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Po ruhet…' : 'Ruaj'}
        </button>
      </form>
    </div>
  );
}

export default function PartnerProducts() {
  const { refreshProducts } = useConfig();
  const [shop, setShop] = useState<Partner | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ shop: Partner; products: Product[] }>('/partner/products')
      .then((r) => {
        setShop(r.shop);
        setProducts(r.products);
      })
      .catch((e) => setError(errorMessage(e)));
    refreshProducts();
  }, [refreshProducts]);
  useEffect(load, [load]);

  async function patch(p: Product, body: Partial<Product>) {
    setProducts((list) => list?.map((x) => (x.id === p.id ? { ...x, ...body } : x)) || null);
    try {
      await api(`/partner/products/${p.id}`, { method: 'PUT', body });
      refreshProducts();
    } catch (e) {
      setError(errorMessage(e));
      load();
    }
  }

  async function remove(p: Product) {
    if (!confirm(`Fshin "${p.name}"?`)) return;
    try {
      await api(`/partner/products/${p.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>{shop?.name || 'Produktet'}</h1>
          <p className="muted">
            Shto, ndrysho ose fshi produktet e tua. Klientët i shohin te vndviti.com/p/{shop?.slug || '…'}. Çmimi që shkruan këtu është çmimi që paguan klienti — VND ta paguan ty të njëjtën shumë kur vjen për ta marrë.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing(emptyProduct(shop))}>
          <Icon name="plus" size={18} /> Shto produkt
        </button>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {!products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <p className="muted">Nuk ke asnjë produkt ende. Prek “Shto produkt” dhe fillo me 5–10 gjërat që shet më shumë.</p>
      ) : (
        <div className="table-wrap">
          <table className="table products-table">
            <thead>
              <tr>
                <th />
                <th>Produkti</th>
                <th className="r">Çmimi</th>
                <th>Në shitje</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.available ? '' : 'dim'}>
                  <td>
                    <ProductImage product={p} size={40} />
                  </td>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted small">{[p.section, p.description].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="r">{euro(p.price_cents)}</td>
                  <td>
                    <button className={`switch${p.available ? ' on' : ''}`} onClick={() => patch(p, { available: !p.available })} aria-label="Në shitje">
                      <i />
                    </button>
                  </td>
                  <td className="nowrap">
                    <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Ndrysho">
                      <Icon name="edit" size={18} />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove(p)} aria-label="Fshi">
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
        <Form
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
