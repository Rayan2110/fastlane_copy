'use client';

import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import type {ProductData, VideoScript, JobStatus} from '@/lib/types';

type ProductRow = {id: number; data: ProductData; createdAt: string};
type ScriptRow = {id: number; productId: number; data: VideoScript};
type VideoRow = {id: number; scriptId: number; filePath: string; posted: boolean};
type JobRow = {id: number; scriptId: number; status: JobStatus; error: string | null};

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'en attente',
  running: 'rendu en cours…',
  done: 'terminé',
  failed: 'échec',
};

export function Dashboard() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/products');
    const json = await res.json();
    setProducts(json.products ?? []);
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

      <div className="grid">
        {products.map((p) => (
          <Link key={p.id} href={`/product/${p.id}`} className="card product-card">
            {p.data.localImages?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${p.data.localImages[0]}`} alt={p.data.title} />
            ) : null}
            <h3>{p.data.title}</h3>
            <div className="meta">
              {p.data.price}
              {p.data.compareAtPrice ? ` (au lieu de ${p.data.compareAtPrice})` : ''}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export function ProductView({productId}: {productId: number}) {
  const [data, setData] = useState<{
    product: ProductRow;
    scripts: ScriptRow[];
    videos: VideoRow[];
    jobs: JobRow[];
  } | null>(null);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/products/${productId}`);
    if (res.ok) setData(await res.json());
  }, [productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasActiveJobs = data?.jobs.some((j) => j.status === 'pending' || j.status === 'running');

  useEffect(() => {
    if (!hasActiveJobs) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [hasActiveJobs, refresh]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/generate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({count}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  const retryJob = async (jobId: number) => {
    if (retryingIds.has(jobId)) return;
    setRetryingIds((prev) => new Set(prev).add(jobId));
    try {
      await fetch(`/api/jobs/${jobId}/retry`, {method: 'POST'});
      await refresh();
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const togglePosted = async (video: VideoRow) => {
    await fetch(`/api/videos/${video.id}/posted`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({posted: !video.posted}),
    });
    await refresh();
  };

  if (!data) return <p className="sub">Chargement…</p>;

  const {product, scripts, videos, jobs} = data;
  const scriptById = new Map(scripts.map((s) => [s.id, s]));

  return (
    <>
      <h1>{product.data.title}</h1>
      <p className="sub">
        {product.data.price}
        {product.data.compareAtPrice ? ` (au lieu de ${product.data.compareAtPrice})` : ''} ·{' '}
        {product.data.localImages?.length ?? 0} images · {videos.length} vidéos
      </p>

      <div className="card">
        <div className="row">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={3}>3 vidéos</option>
            <option value={5}>5 vidéos</option>
            <option value={10}>10 vidéos</option>
            <option value={20}>20 vidéos</option>
          </select>
          <button onClick={generate} disabled={busy}>
            {busy ? 'Claude écrit les scripts…' : 'Générer les vidéos'}
          </button>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
      </div>

      {jobs.length > 0 ? (
        <section>
          <h2>Rendus</h2>
          <div className="card">
            {jobs.map((j) => {
              const script = scriptById.get(j.scriptId);
              return (
                <div key={j.id} style={{padding: '6px 0'}}>
                  <div className="row" style={{justifyContent: 'space-between'}}>
                    <span style={{color: 'var(--muted)', fontSize: 14}}>
                      {script ? `${script.data.angle} — « ${script.data.hook} »` : `Script ${j.scriptId}`}
                    </span>
                    <span className="row" style={{gap: 8}}>
                      <span className={`badge ${j.status}`}>{STATUS_LABEL[j.status]}</span>
                      {j.status === 'failed' ? (
                        <button
                          className="ghost"
                          style={{padding: '4px 10px', fontSize: 12}}
                          disabled={retryingIds.has(j.id)}
                          onClick={() => retryJob(j.id)}
                        >
                          {retryingIds.has(j.id) ? '…' : 'Relancer'}
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {j.status === 'failed' && j.error ? (
                    <div className="error-box" style={{marginTop: 6, fontSize: 13}}>{j.error}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section>
          <h2>Vidéos</h2>
          <div className="video-grid">
            {videos.map((v) => {
              const script = scriptById.get(v.scriptId);
              return (
                <div key={v.id} className="card video-card">
                  <video src={`/${v.filePath}`} controls preload="metadata" />
                  {script ? (
                    <div className="meta" style={{color: 'var(--muted)', fontSize: 13, marginTop: 8}}>
                      {script.data.angle}
                    </div>
                  ) : null}
                  <div className="row">
                    <a href={`/${v.filePath}`} download style={{color: 'var(--accent)', fontSize: 14}}>
                      Télécharger
                    </a>
                    <button className="ghost" style={{padding: '6px 12px', fontSize: 13}} onClick={() => togglePosted(v)}>
                      {v.posted ? '✓ Publiée' : 'Marquer publiée'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
