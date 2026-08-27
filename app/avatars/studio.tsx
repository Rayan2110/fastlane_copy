'use client';

import {useCallback, useEffect, useState} from 'react';
import type {AvatarRow} from '@/lib/types';

const PRESET_LABELS: Record<string, string> = {
  'femme-20s': 'Femme ~20 ans',
  'femme-30s': 'Femme ~30 ans',
  'homme-20s': 'Homme ~20 ans',
  'homme-30s': 'Homme ~30 ans',
};

export function AvatarStudio() {
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('femme-20s');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/avatars');
    const json = await res.json();
    setAvatars(json.avatars ?? []);
    setPresets(json.presets ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/avatars', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name || PRESET_LABELS[preset] || 'Avatar', preset}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue');
      setName('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await fetch(`/api/avatars/${id}`, {method: 'DELETE'});
    await refresh();
  };

  return (
    <>
      <div className="card">
        <div className="row" style={{flexWrap: 'wrap'}}>
          <input
            type="url"
            style={{maxWidth: 240}}
            placeholder="Nom (ex: Léa)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select style={{flex: 'none', minWidth: 170}} value={preset} onChange={(e) => setPreset(e.target.value)}>
            {presets.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p] ?? p}
              </option>
            ))}
          </select>
          <button onClick={create} disabled={busy}>
            {busy ? 'Génération…' : 'Créer (~0,03 $)'}
          </button>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
      </div>

      <div className="grid">
        {avatars.map((a) => (
          <div key={a.id} className="card product-card" style={{cursor: 'default'}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/${a.imagePath}`} alt={a.name} style={{height: 260, objectFit: 'cover'}} />
            <h3>{a.name}</h3>
            <div className="row" style={{justifyContent: 'space-between', marginTop: 8}}>
              <span className="meta">avatar #{a.id}</span>
              <button className="ghost small" onClick={() => remove(a.id)}>
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {avatars.length === 0 ? (
          <p className="sub">Aucun avatar pour l’instant — crée le premier ci-dessus.</p>
        ) : null}
      </div>
    </>
  );
}
