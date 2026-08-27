import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createJob,
  setJobStatus,
  getScript,
  getProduct,
  insertVideo,
  claimNextPendingJob,
  failRunningJobs,
} from './db';
import {synthesize} from './tts';
import {detectBeats} from './beats';
import {getAvatar} from './db';
import {ensureHoldImage} from './avatars';
import {falUpload, falRun, downloadTo, FAL_MODELS} from './fal';
import type {Scene, RenderFormat} from './types';

const MAX_CONCURRENT = 2;
const RENDER_TIMEOUT_MS = 20 * 60_000;
const RENDER_CONCURRENCY = Math.max(4, Math.floor(os.cpus().length / 2));
const MAX_AVATAR_AUDIO_S = 58; // limite Kling: 60 s

export type ClaimedJob = {
  id: number;
  scriptId: number;
  format: RenderFormat;
  avatarId: number | null;
};

type Executor = (job: ClaimedJob) => Promise<void>;

// L'etat vit sur globalThis : en `next dev`, chaque recompilation recree le
// module, mais les rendus en cours et la limite de concurrence doivent
// survivre. La DB reste la source de verite pour la file (jobs 'pending').
type QueueState = {running: number; recovered: boolean; executor: Executor};
const g = globalThis as unknown as {__fastlaneQueue?: QueueState};

function state(): QueueState {
  if (!g.__fastlaneQueue) {
    g.__fastlaneQueue = {running: 0, recovered: false, executor: defaultExecutor};
  }
  return g.__fastlaneQueue;
}

// En `next dev`, l'etat survit au HMR mais l'executor capture du code perime :
// on le rafraichit a chaque (re)chargement du module. Les tests appellent
// setExecutor apres import, donc rien ne change pour eux.
state().executor = defaultExecutor;

// Injection pour les tests de file.
export function setExecutor(fn: Executor): void {
  state().executor = fn;
}

// Marque 'failed' les jobs restes 'running' apres un crash/redemarrage,
// puis relance la pompe sur les 'pending' restants. Idempotent par process.
export function ensureQueueRecovered(): void {
  const s = state();
  if (s.recovered) return;
  s.recovered = true;
  failRunningJobs('Interrompu par un redémarrage du serveur — clique sur Relancer');
  pump();
}

export function enqueueRender(
  scriptId: number,
  opts: {format?: RenderFormat; avatarId?: number} = {}
): number {
  ensureQueueRecovered();
  const jobId = createJob(scriptId, opts.format ?? 'slideshow', opts.avatarId);
  pump();
  return jobId;
}

function safeSetStatus(jobId: number, status: 'done' | 'failed', error?: string): void {
  try {
    setJobStatus(jobId, status, error);
  } catch {
    // DB indisponible (contention multi-process) : ne pas faire tomber la pompe
  }
}

function pump(): void {
  const s = state();
  while (s.running < MAX_CONCURRENT) {
    let claim: ReturnType<typeof claimNextPendingJob>;
    try {
      claim = claimNextPendingJob();
    } catch {
      break;
    }
    if (!claim) break;
    const {id: jobId} = claim;
    s.running++;
    let job: Promise<void>;
    try {
      job = Promise.resolve(s.executor(claim));
    } catch (err) {
      // executor qui leve en synchrone : ne pas fuiter le compteur
      safeSetStatus(jobId, 'failed', (err as Error).message?.slice(0, 1000));
      s.running--;
      continue;
    }
    job
      .then(() => safeSetStatus(jobId, 'done'))
      .catch((err: Error) => safeSetStatus(jobId, 'failed', err.message?.slice(0, 1000)))
      .finally(() => {
        s.running--;
        pump();
      });
  }
}

async function pickMusicFile(): Promise<string | undefined> {
  try {
    const dir = path.join(process.cwd(), 'public', 'music');
    const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.mp3'));
    if (files.length === 0) return undefined;
    return `music/${files[Math.floor(Math.random() * files.length)]}`;
  } catch {
    return undefined;
  }
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    // child.kill() ne tue que cmd.exe, pas l'arbre en dessous (node/chrome).
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true}).on('error', () => {});
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // deja mort
    }
  }
}

function runRemotionRender(
  propsPath: string,
  outAbs: string,
  compositionId: string = 'Slideshow'
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const q = (s: string) => `"${s}"`;
    const child = spawn(
      'npx',
      [
        'remotion',
        'render',
        'video/index.ts',
        compositionId,
        q(outAbs),
        `--props=${q(propsPath)}`,
        `--concurrency=${RENDER_CONCURRENCY}`,
        '--crf=17',
        '--jpeg-quality=90',
        '--log=error',
      ],
      {shell: true, windowsHide: true, cwd: process.cwd()}
    );
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(child.pid);
      reject(new Error(`Rendu interrompu après ${RENDER_TIMEOUT_MS / 60_000} min (timeout)`));
    }, RENDER_TIMEOUT_MS);

    // stdout doit etre draine sinon le child bloque des ~64 Ko ecrits.
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`remotion render code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function defaultExecutor(claim: ClaimedJob): Promise<void> {
  const {scriptId, id: jobId, format, avatarId} = claim;
  const script = getScript(scriptId);
  if (!script) throw new Error(`Script ${scriptId} introuvable`);
  const product = getProduct(script.productId);
  if (!product) throw new Error(`Produit ${script.productId} introuvable`);

  const images: string[] = product.data.localImages ?? [];
  if (images.length === 0) throw new Error('Aucune image locale pour ce produit');

  const mediaDir = path.join(process.cwd(), 'public', 'media', String(script.productId));
  await fs.mkdir(mediaDir, {recursive: true});

  // Le CTA fait partie de la voix : on l'integre a la derniere scene pour que
  // la repartition des timings colle a l'audio reel (sinon ~1 s de derive).
  const scenes: Scene[] = script.data.scenes.map((s, i) =>
    i === script.data.scenes.length - 1
      ? {...s, voiceText: `${s.voiceText} ${script.data.cta}`}
      : s
  );
  const voiceText = scenes.map((s) => s.voiceText).join(' ');

  // Artefacts keyes par jobId : un retry concurrent ou un process orphelin
  // n'ecrit jamais dans les fichiers d'un autre rendu.
  const base = `${scriptId}-j${jobId}`;
  const audioBase = path.join(mediaDir, `voice-${base}`);
  const propsPath = path.join(mediaDir, `props-${base}.json`);
  const outRel = `media/${script.productId}/video-${base}.mp4`;
  const outAbs = path.join(process.cwd(), 'public', outRel);

  const {timings} = await synthesize(voiceText, audioBase);

  const musicFile = await pickMusicFile();
  // Coupes calees sur le rythme de la musique (music-tempo), si musique.
  let beatFrames: number[] | undefined;
  if (musicFile) {
    try {
      beatFrames = (await detectBeats(musicFile)).map((s) => Math.round(s * 30));
    } catch {
      beatFrames = undefined; // pas bloquant : decoupage regulier en fallback
    }
  }

  const shared = {
    images,
    scenes,
    timings,
    price: product.data.price,
    compareAtPrice: product.data.compareAtPrice,
    brand: product.data.vendor ?? product.data.title.split(' ')[0],
    audioFile: `media/${script.productId}/voice-${base}.mp3`,
    musicFile,
    beatFrames,
    styleVariant: (scriptId % 2 === 0 ? 'dark' : 'light') as 'dark' | 'light',
  };

  let compositionId = 'Slideshow';
  let props: Record<string, unknown> = {...shared, brollClips: product.data.brollClips};

  if (format === 'avatar') {
    if (!avatarId) throw new Error('Aucun avatar choisi pour ce rendu');
    const avatar = getAvatar(avatarId);
    if (!avatar) throw new Error(`Avatar ${avatarId} introuvable`);
    const audioSeconds = (timings[timings.length - 1]?.endMs ?? 0) / 1000;
    if (audioSeconds > MAX_AVATAR_AUDIO_S) {
      throw new Error(
        `Voix off de ${Math.round(audioSeconds)}s — trop long pour l'avatar (max ${MAX_AVATAR_AUDIO_S}s). Raccourcis le script.`
      );
    }
    // 1. Avatar tenant le produit (genere une fois par couple avatar/produit).
    const holdRel = await ensureHoldImage(avatar, script.productId, images[0]);
    // 2. Video parlante Kling (image + audio -> mp4 lip-synce).
    const [imageUrl, audioUrl] = await Promise.all([
      falUpload(path.join(process.cwd(), 'public', holdRel), 'image/png'),
      falUpload(`${audioBase}.mp3`, 'audio/mpeg'),
    ]);
    const out = await falRun<{video: {url: string}}>(FAL_MODELS.talkingAvatar, {
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: '.',
    });
    if (!out.video?.url) throw new Error('Kling n’a retourné aucune vidéo');
    const avatarClipRel = `media/${script.productId}/avatarclip-${base}.mp4`;
    await downloadTo(out.video.url, path.join(process.cwd(), 'public', avatarClipRel));

    compositionId = 'AvatarUGC';
    props = {...shared, avatarVideo: avatarClipRel, brollClips: product.data.brollClips};
  }

  await fs.writeFile(propsPath, JSON.stringify(props), 'utf8');

  await runRemotionRender(propsPath, outAbs, compositionId);
  insertVideo(scriptId, outRel);

  // Succes : l'audio est encode dans le mp4, les intermediaires degagent.
  // (En echec, on les garde volontairement pour le debug.)
  await Promise.allSettled([
    fs.rm(propsPath, {force: true}),
    fs.rm(`${audioBase}.mp3`, {force: true}),
    fs.rm(`${audioBase}.words.json`, {force: true}),
  ]);
}
