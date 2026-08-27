import {fal} from '@fal-ai/client';
import fs from 'node:fs/promises';
import path from 'node:path';

// Model IDs verifies (aout 2026) — voir docs/superpowers/specs + rapport council.
export const FAL_MODELS = {
  portrait: 'fal-ai/bytedance/seedream/v4/text-to-image', // $0.03/image
  productInHand: 'fal-ai/nano-banana/edit', // $0.039/image
  talkingAvatar: 'fal-ai/kling-video/ai-avatar/v2/standard', // $0.0562/s, audio 2-60s max 5MB
  imageToVideo: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', // ~$0.11 le clip 720p 5s
} as const;

export const AVATAR_PRICE_PER_SECOND = 0.0562;
export const BROLL_PRICE_PER_CLIP = 0.11;
export const PORTRAIT_PRICE = 0.03;
export const HOLD_PRICE = 0.039;

let configured = false;

function ensureConfigured(): void {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY manquante — ajoute ta clé fal.ai dans .env.local');
  }
  if (!configured) {
    fal.config({credentials: process.env.FAL_KEY});
    configured = true;
  }
}

// Upload un fichier local vers le storage fal -> URL https://fal.media/...
export async function falUpload(absPath: string, mime: string): Promise<string> {
  ensureConfigured();
  const buf = await fs.readFile(absPath);
  const file = new File([buf], path.basename(absPath), {type: mime});
  try {
    return await fal.storage.upload(file);
  } catch (err) {
    throw friendlyFalError(err);
  }
}

// Traduit les erreurs fal en messages actionnables.
function friendlyFalError(err: unknown): Error {
  const e = err as {status?: number; body?: {detail?: unknown}; message?: string};
  const detail =
    typeof e.body?.detail === 'string' ? e.body.detail : JSON.stringify(e.body?.detail ?? '');
  if (detail.includes('Exhausted balance') || detail.includes('locked')) {
    return new Error(
      'Crédits fal.ai épuisés — recharge ton compte sur fal.ai/dashboard/billing puis relance.'
    );
  }
  if (e.status === 401 || e.status === 403) {
    return new Error(`Accès fal.ai refusé (${e.status}): ${detail || 'vérifie ta FAL_KEY dans .env.local'}`);
  }
  if (e.status === 422) {
    return new Error(`Requête fal.ai invalide: ${detail}`);
  }
  return new Error(`Erreur fal.ai: ${detail || e.message || 'inconnue'}`);
}

// Appel bloquant avec polling interne (le job de rendu tourne deja en fond).
export async function falRun<T>(model: string, input: Record<string, unknown>): Promise<T> {
  ensureConfigured();
  try {
    const result = await fal.subscribe(model, {input, logs: false});
    return result.data as T;
  } catch (err) {
    throw friendlyFalError(err);
  }
}

export async function downloadTo(url: string, absPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement fal échoué (HTTP ${res.status})`);
  await fs.mkdir(path.dirname(absPath), {recursive: true});
  await fs.writeFile(absPath, Buffer.from(await res.arrayBuffer()));
}
