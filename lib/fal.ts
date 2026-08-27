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
    model: 'fal-ai/kling-video/ai-avatar/v2/pro',
    pricePerSecond: 0.115,
    label: 'Qualité — Kling v2 Pro (lip-sync plus fin)',
    buildInput: (image_url, audio_url) => ({image_url, audio_url, prompt: '.'}),
  },
  premium: {
    model: 'fal-ai/bytedance/omnihuman/v1.5',
    pricePerSecond: 0.16,
    label: 'Premium — OmniHuman 1.5 (gestuelle + émotion, 1080p)',
    buildInput: (image_url, audio_url) => ({image_url, audio_url}),
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

// Journal des requetes payantes : si la recuperation echoue, le request_id
// permet de retrouver le resultat sur fal.ai/dashboard/requests.
async function logFalRequest(model: string, requestId: string): Promise<void> {
  try {
    const line = `${new Date().toISOString()} ${model} ${requestId}\n`;
    await fs.appendFile(path.join(process.cwd(), 'data', 'fal-requests.log'), line, 'utf8');
  } catch {
    // le journal ne doit jamais bloquer un rendu
  }
}

const POLL_INTERVAL_MS = 3000;
const RUN_TIMEOUT_MS = 15 * 60_000;

// Appel bloquant via l'API queue BRUTE de fal : on suit les URLs renvoyees
// par LEUR serveur (status_url/response_url) au lieu de laisser le SDK les
// construire — le SDK se trompe sur les fournisseurs hors namespace fal-ai/
// (ex. mirage-api/..., cause du "Path / not found").
export async function falRun<T>(model: string, input: Record<string, unknown>): Promise<T> {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY manquante — ajoute ta clé fal.ai dans .env.local');
  }
  const headers = {Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json'};

  const submitRes = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const submitBody = (await submitRes.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!submitRes.ok || !submitBody.status_url || !submitBody.response_url) {
    throw friendlyFalError({status: submitRes.status, body: submitBody});
  }
  const {request_id: requestId, status_url: statusUrl, response_url: responseUrl} = submitBody;
  if (requestId) await logFalRequest(model, requestId);

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        `fal.ai: timeout après 15 min (requête ${requestId} — résultat récupérable sur fal.ai/dashboard/requests)`
      );
    }
    const statusRes = await fetch(statusUrl, {headers}).catch(() => undefined);
    const status = statusRes?.ok
      ? ((await statusRes.json().catch(() => ({}))) as {status?: string}).status
      : undefined;
    // Tout etat terminal (COMPLETED, FAILED…) sort de la boucle : le verdict
    // reel se lit sur response_url.
    if (status && status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const resultRes = await fetch(responseUrl, {headers});
  const resultBody = (await resultRes.json().catch(() => ({}))) as T & {detail?: unknown};
  if (!resultRes.ok) {
    throw friendlyFalError({status: resultRes.status, body: resultBody as {detail?: unknown}});
  }
  return resultBody;
}

export async function downloadTo(url: string, absPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement fal échoué (HTTP ${res.status})`);
  await fs.mkdir(path.dirname(absPath), {recursive: true});
  await fs.writeFile(absPath, Buffer.from(await res.arrayBuffer()));
}
