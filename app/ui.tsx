'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import type {ProductData} from '@/lib/types';

type ProductRow = {id: number; data: ProductData; createdAt: string};
type VideoCounts = Record<number, {total: number; unposted: number}>;

function storeOf(p: ProductRow): string {
  try {
    return new URL(p.data.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'inconnu';
  }
}

export function Dashboard() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [counts, setCounts] = useState<VideoCounts>({});
  const [search, setSearch] = useState('');
  const [store, setStore] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/products');
    const json = await res.json();
    setProducts(json.products ?? []);
    setCounts(json.videoCounts ?? {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      setUrl('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stores = useMemo(
    () => [...new Set(products.map(storeOf))].sort(),
    [products]
  );

  const visible = products.filter((p) => {
    if (store && storeOf(p) !== store) return false;
    if (search && !p.data.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="card">
        <div className="row">
          <input
            type="url"
            placeholder="https://ta-boutique.com/products/ton-produit"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && url && !busy && analyze()}
          />
          <button onClick={analyze} disabled={busy || !url}>
            {busy ? 'Analyse…' : 'Analyser'}
          </button>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
      </div>

      {products.length > 1 ? (
        <div className="row" style={{marginTop: 20, gap: 10}}>
          <input
            type="url"
            style={{maxWidth: 280}}
            placeholder="🔍 Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select style={{flex: 'none', minWidth: 180}} value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">Toutes les boutiques</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid">
        {visible.map((p) => {
          const c = counts[p.id];
          return (
            <Link key={p.id} href={`/product/${p.id}`} className="card product-card">
              {p.data.localImages?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${p.data.localImages[0]}`} alt={p.data.title} />
              ) : null}
              <h3>{p.data.title}</h3>
              <div className="meta">
                {p.data.price || 'prix non détecté'}
                {p.data.compareAtPrice ? ` (au lieu de ${p.data.compareAtPrice})` : ''}
              </div>
              <div className="meta" style={{marginTop: 6}}>
                <span className="chip angle">{storeOf(p)}</span>{' '}
                {c ? (
                  <span className={`badge ${c.unposted > 0 ? 'running' : 'done'}`}>
                    {c.unposted > 0 ? `${c.unposted} à poster` : `${c.total} publiées`}
                  </span>
                ) : (
                  <span className="badge pending">pas de vidéo</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
