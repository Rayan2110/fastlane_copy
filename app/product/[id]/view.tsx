'use client';

import {useCallback, useEffect, useState} from 'react';
import type {ProductData, VideoScript, JobStatus, Scene, AvatarRow, RenderFormat} from '@/lib/types';

type Tier = 'eco' | 'quality' | 'premium';
const WORDS_PER_SECOND = 2.6; // debit moyen du TTS francais

const TIER_INFO: Record<Tier, {label: string; avatarPerSecond: number; brollPerClip: number}> = {
  eco: {label: '🟢 Éco', avatarPerSecond: 0.0562, brollPerClip: 0.11},
  quality: {label: '🟡 Qualité', avatarPerSecond: 0.16, brollPerClip: 0.2},
  premium: {label: '🔴 Premium', avatarPerSecond: 0.3, brollPerClip: 2.35},
};

function estimateAvatarCost(script: VideoScript, tier: Tier): number {
  const words = [...script.scenes.map((s) => s.voiceText), script.cta]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return (words / WORDS_PER_SECOND) * TIER_INFO[tier].avatarPerSecond;
}

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

// ---------- Editeur d'un script ----------

function ScriptCard({
  script,
  job,
  checked,
  onToggle,
  onSaved,
  busyGlobal,
}: {
  script: ScriptRow;
  job?: JobRow;
  checked: boolean;
  onToggle: () => void;
  onSaved: () => Promise<void>;
  busyGlobal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<VideoScript>(script.data);
  const [busy, setBusy] = useState<'save' | 'regen' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(script.data);
  }, [script.data]);

  const patchScene = (i: number, patch: Partial<Scene>) => {
    setDraft((d) => ({
      ...d,
      scenes: d.scenes.map((s, j) => (j === i ? {...s, ...patch} : s)),
    }));
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur');
      await onSaved();
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy('regen');
    setError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}/regenerate`, {method: 'POST'});
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur');
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="script-card">
      <div className="row" style={{justifyContent: 'space-between', gap: 10}}>
        <label className="row" style={{gap: 10, cursor: 'pointer', flex: 1, minWidth: 0}}>
          <input type="checkbox" checked={checked} onChange={onToggle} />
          <span className="chip angle">{script.data.angle}</span>
          <span className="hook" title={script.data.hook}>
            « {script.data.hook} »
          </span>
        </label>
        <span className="row" style={{gap: 8, flexShrink: 0}}>
          {job ? <span className={`badge ${job.status}`}>{STATUS_LABEL[job.status]}</span> : null}
          <button
            className="ghost small"
            disabled={busy !== null || busyGlobal}
            onClick={regenerate}
            title="Demander à Claude une nouvelle version (même angle)"
          >
            {busy === 'regen' ? 'Claude réécrit…' : '↻ Régénérer'}
          </button>
          <button className="ghost small" onClick={() => setOpen(!open)}>
            {open ? 'Fermer' : '✎ Éditer'}
          </button>
        </span>
      </div>

      {open ? (
        <div className="script-editor">
          <label className="field">
            <span>Hook (accroche)</span>
            <input
              value={draft.hook}
              onChange={(e) => setDraft({...draft, hook: e.target.value})}
            />
          </label>
          {draft.scenes.map((scene, i) => (
            <div key={i} className="scene-edit">
              <div className="scene-head">Scène {i + 1} · image {scene.imageIndex}</div>
              <label className="field">
                <span>Texte à l'écran</span>
                <input
                  value={scene.screenText}
                  onChange={(e) => patchScene(i, {screenText: e.target.value})}
                />
              </label>
              <label className="field">
                <span>Voix off</span>
                <textarea
                  rows={2}
                  value={scene.voiceText}
                  onChange={(e) => patchScene(i, {voiceText: e.target.value})}
                />
              </label>
            </div>
          ))}
          <label className="field">
            <span>Appel à l'action (fin)</span>
            <input value={draft.cta} onChange={(e) => setDraft({...draft, cta: e.target.value})} />
          </label>
          <div className="row" style={{justifyContent: 'flex-end', gap: 8}}>
            <button className="ghost small" onClick={() => setDraft(script.data)}>
              Annuler les modifs
            </button>
            <button className="small" disabled={busy !== null} onClick={save}>
              {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <div className="error-box" style={{marginTop: 8}}>{error}</div> : null}
      {job?.status === 'failed' && job.error ? (
        <div className="error-box" style={{marginTop: 8, fontSize: 13}}>{job.error}</div>
      ) : null}
    </div>
  );
}

// ---------- Vue produit ----------

export function ProductView({productId}: {productId: number}) {
  const [data, setData] = useState<{
    product: ProductRow;
    scripts: ScriptRow[];
    videos: VideoRow[];
    jobs: JobRow[];
  } | null>(null);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<RenderFormat>('slideshow');
  const [tier, setTier] = useState<Tier>('eco');
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [avatarId, setAvatarId] = useState<number | ''>('');
  const [brollBusy, setBrollBusy] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/products/${productId}`);
    if (res.ok) setData(await res.json());
  }, [productId]);

  useEffect(() => {
    refresh();
    fetch('/api/avatars')
      .then((r) => r.json())
      .then((j) => setAvatars(j.avatars ?? []))
      .catch(() => {});
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
    setWarning(null);
    try {
      const res = await fetch(`/api/products/${productId}/generate`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({count}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      if (json.warning) setWarning(json.warning);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const renderSelection = async () => {
    if (selected.size === 0) return;
    if (format === 'avatar' && !avatarId) {
      setError('Choisis un avatar (ou crée-en un sur la page Avatars)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/scripts/render', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          scriptIds: [...selected],
          format,
          avatarId: avatarId || undefined,
          tier,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

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

  const markAllPosted = async () => {
    await fetch(`/api/products/${productId}/mark-posted`, {method: 'POST'});
    await refresh();
  };

  const animateImage = async (imageIndex: number) => {
    if (brollBusy.has(imageIndex)) return;
    setBrollBusy((prev) => new Set(prev).add(imageIndex));
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/broll`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({imageIndex, tier}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBrollBusy((prev) => {
        const next = new Set(prev);
        next.delete(imageIndex);
        return next;
      });
    }
  };

  if (!data) return <p className="sub">Chargement…</p>;

  const {product, scripts, videos, jobs} = data;
  const scriptById = new Map(scripts.map((s) => [s.id, s]));
  const latestByScript = new Map<number, JobRow>();
  for (const j of [...jobs].sort((a, b) => a.id - b.id)) {
    latestByScript.set(j.scriptId, j);
  }
  const failedJobs = [...latestByScript.values()].filter((j) => j.status === 'failed');
  const unposted = videos.filter((v) => !v.posted).length;

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllIdle = () => {
    const idle = scripts.filter((s) => {
      const j = latestByScript.get(s.id);
      return !j || j.status === 'failed';
    });
    setSelected(new Set(idle.map((s) => s.id)));
  };

  return (
    <>
      <h1>{product.data.title}</h1>
      <p className="sub">
        {product.data.price || 'prix non détecté'}
        {product.data.compareAtPrice ? ` (au lieu de ${product.data.compareAtPrice})` : ''} ·{' '}
        {product.data.localImages?.length ?? 0} images · {videos.length} vidéos
        {unposted > 0 ? ` (${unposted} à poster)` : ''}
      </p>

      <div className="card">
        <div className="row" style={{flexWrap: 'wrap'}}>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={5}>5 scripts</option>
            <option value={10}>10 scripts</option>
            <option value={20}>20 scripts</option>
          </select>
          <button onClick={generate} disabled={busy}>
            {busy ? 'Claude écrit…' : '1 · Générer les scripts'}
          </button>
          <select
            style={{flex: 'none', minWidth: 190}}
            value={format}
            onChange={(e) => setFormat(e.target.value as RenderFormat)}
          >
            <option value="slideshow">🎞 Slideshow (gratuit)</option>
            <option value="avatar">🧑 Avatar UGC (payant)</option>
          </select>
          <select
            style={{flex: 'none', minWidth: 150}}
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
            title="Niveau de qualité des générations IA (avatars et B-roll)"
          >
            <option value="eco">🟢 Éco</option>
            <option value="quality">🟡 Qualité</option>
            <option value="premium">🔴 Premium</option>
          </select>
          {format === 'avatar' ? (
            <select
              style={{flex: 'none', minWidth: 160}}
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— avatar —</option>
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            onClick={renderSelection}
            disabled={busy || selected.size === 0}
            title="Lance le rendu des scripts cochés"
          >
            {`2 · Rendre la sélection (${selected.size})`}
          </button>
        </div>
        <p className="hint">
          Génère → relis/édite/écrème → coche les bons → rends. Slideshow : gratuit, ~2-3 min.
          {format === 'avatar' && data ? (
            <>
              {' '}
              Avatar {TIER_INFO[tier].label} : crédits fal.ai —{' '}
              <b style={{color: 'var(--accent)'}}>
                ~
                {[...selected]
                  .reduce((sum, id) => {
                    const s = scripts.find((x) => x.id === id);
                    return sum + (s ? estimateAvatarCost(s.data, tier) : 0);
                  }, 0)
                  .toFixed(2)}{' '}
                $ pour la sélection
              </b>{' '}
              (+0,04 $ la première fois par produit), ~5-10 min par vidéo.
            </>
          ) : null}
          {avatars.length === 0 && format === 'avatar' ? (
            <>
              {' '}
              <a href="/avatars" style={{color: 'var(--accent)'}}>
                Crée d’abord un avatar →
              </a>
            </>
          ) : null}
        </p>
        {error ? <div className="error-box">{error}</div> : null}
        {warning ? <div className="error-box" style={{background: '#4a3b12', color: 'var(--accent)'}}>{warning}</div> : null}
      </div>

      {(product.data.localImages?.length ?? 0) > 0 ? (
        <section>
          <h2>Images du produit</h2>
          <p className="hint" style={{marginTop: 0}}>
            🎬 « Animer » transforme une photo en clip vidéo de 5 s (
            {TIER_INFO[tier].brollPerClip.toFixed(2).replace('.', ',')} $ en tier{' '}
            {TIER_INFO[tier].label}). Les clips remplacent automatiquement l’image fixe dans
            toutes les prochaines vidéos. Ré-animer une image écrase l’ancien clip.
          </p>
          <div className="image-strip">
            {product.data.localImages!.map((img, i) => {
              const animated = Boolean(product.data.brollClips?.[i]);
              return (
                <div key={i} className="image-cell">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/${img}`} alt={`image ${i}`} />
                  {animated ? (
                    <span className="row" style={{gap: 6}}>
                      <span className="badge done">🎬 animée</span>
                      <button
                        className="ghost small"
                        disabled={brollBusy.has(i)}
                        onClick={() => animateImage(i)}
                        title="Régénérer le clip dans le tier sélectionné"
                      >
                        {brollBusy.has(i) ? '…' : '↻'}
                      </button>
                    </span>
                  ) : (
                    <button
                      className="ghost small"
                      disabled={brollBusy.has(i)}
                      onClick={() => animateImage(i)}
                    >
                      {brollBusy.has(i)
                        ? 'Animation…'
                        : `Animer (${TIER_INFO[tier].brollPerClip.toFixed(2).replace('.', ',')} $)`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {scripts.length > 0 ? (
        <section>
          <div className="row" style={{justifyContent: 'space-between'}}>
            <h2>Scripts ({scripts.length})</h2>
            <button className="ghost small" onClick={selectAllIdle}>
              Tout cocher (non rendus)
            </button>
          </div>
          <div className="script-list">
            {[...scripts].reverse().map((s) => (
              <ScriptCard
                key={s.id}
                script={s}
                job={latestByScript.get(s.id)}
                checked={selected.has(s.id)}
                onToggle={() => toggleSelected(s.id)}
                onSaved={refresh}
                busyGlobal={busy}
              />
            ))}
          </div>
        </section>
      ) : null}

      {failedJobs.length > 0 ? (
        <section>
          <h2>Rendus en échec</h2>
          <div className="card">
            {failedJobs.map((j) => {
              const script = scriptById.get(j.scriptId);
              return (
                <div key={j.id} className="row" style={{padding: '6px 0', justifyContent: 'space-between'}}>
                  <span style={{color: 'var(--muted)', fontSize: 14}}>
                    {script ? `${script.data.angle} — « ${script.data.hook} »` : `Script ${j.scriptId}`}
                  </span>
                  <button
                    className="ghost small"
                    disabled={retryingIds.has(j.id)}
                    onClick={() => retryJob(j.id)}
                  >
                    {retryingIds.has(j.id) ? '…' : 'Relancer'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section>
          <div className="row" style={{justifyContent: 'space-between', flexWrap: 'wrap', gap: 8}}>
            <h2>Vidéos ({videos.length})</h2>
            <span className="row" style={{gap: 8}}>
              {unposted > 0 ? (
                <a className="button-link" href={`/api/products/${productId}/export`}>
                  ⬇ Télécharger les {unposted} non publiées (ZIP)
                </a>
              ) : null}
              {unposted > 0 ? (
                <button className="ghost small" onClick={markAllPosted}>
                  Tout marquer publié
                </button>
              ) : null}
            </span>
          </div>
          <div className="video-grid">
            {videos.map((v) => {
              const script = scriptById.get(v.scriptId);
              return (
                <div key={v.id} className="card video-card">
                  <video src={`/${v.filePath}`} controls preload="metadata" />
                  {script ? (
                    <div style={{color: 'var(--muted)', fontSize: 13, marginTop: 8}}>
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
