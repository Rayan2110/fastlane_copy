import {fal} from '@fal-ai/client';
import fs from 'node:fs/promises';
import path from 'node:path';

// Model IDs verifies (recherche 27/08/2026) — 3 tiers de qualite.
export type QualityTier = 'eco' | 'quality' | 'premium';

export const FAL_MODELS = {
  portrait: 'fal-ai/bytedance/seedream/v4/text-to-image', // $0.03/image
  productInHand: 'fal-ai/nano-banana/edit', // $0.039/image
} as const;

// --- Avatars parlants (image + audio -> video lip-syncee) ---
export const AVATAR_TIERS: Record<
  QualityTier,
  {
    model: string;
    pricePerSecond: number;
    label: string;
    buildInput: (imageUrl: string, audioUrl: string) => Record<string, unknown>;
  }
> = {
  eco: {
    model: 'fal-ai/kling-video/ai-avatar/v2/standard',
    pricePerSecond: 0.0562,
    label: 'Éco — Kling v2 (itération en masse)',
    buildInput: (image_url, audio_url) => ({image_url, audio_url, prompt: '.'}),
  },
  quality: {
    model: 'fal-ai/bytedance/omnihuman/v1.5',
    pricePerSecond: 0.16,
    label: 'Qualité — OmniHuman 1.5 (gestuelle + émotion, 1080p)',
    buildInput: (image_url, audio_url) => ({image_url, audio_url}),
  },
  premium: {
    model: 'mirage-api/avatar-x',
    pricePerSecond: 0.3,
    label: 'Premium — Mirage Avatar X (décor + caméra vivants)',
    buildInput: (reference_image_url, audio_url) => ({
      reference_image_url,
      audio_url,
      prompt:
        'casual UGC selfie video, person holding the product and talking to camera, handheld phone camera, natural indoor daylight, realistic',
    }),
  },
};

// --- B-roll produit (image -> clip anime ~5 s) ---
export const BROLL_TIERS: Record<
  QualityTier,
  {
    model: string;
    pricePerClip: number;
    label: string;
    buildInput: (imageUrl: string, prompt: string) => Record<string, unknown>;
  }
> = {
  eco: {
    model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    pricePerClip: 0.11,
    label: 'Éco — Seedance v1 fast (720p)',
    buildInput: (image_url, prompt) => ({
      prompt,
      image_url,
      aspect_ratio: '9:16',
      resolution: '720p',
      duration: '5', // string enum pour ce modele
      camera_fixed: false,
      enable_safety_checker: true,
    }),
  },
  quality: {
    model: 'minimax/h3-max/image-to-video',
    pricePerClip: 0.2,
    label: 'Qualité — MiniMax H3 Max (n°1 de l’arène i2v)',
    buildInput: (image_url, prompt) => ({
      prompt,
      image_url,
      duration: 5, // numerique pour ce modele; le ratio suit l'image 9:16
      resolution: '768p',
    }),
  },
  premium: {
    model: 'bytedance/seedance-2.5/reference-to-video',
    pricePerClip: 2.35,
    label: 'Premium — Seedance 2.5 (cohérence produit parfaite)',
    buildInput: (image_url, prompt) => ({
      prompt,
      reference_image_urls: [image_url],
      aspect_ratio: '9:16',
      resolution: '720p',
      duration: 5,
    }),
  },
};

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
