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
import type {Scene} from './types';

const MAX_CONCURRENT = 2;
const RENDER_TIMEOUT_MS = 20 * 60_000;
const RENDER_CONCURRENCY = Math.max(4, Math.floor(os.cpus().length / 2));

type Executor = (scriptId: number) => Promise<void>;

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

export function enqueueRender(scriptId: number): number {
  ensureQueueRecovered();
  const jobId = createJob(scriptId);
  pump();
  return jobId;
}

function pump(): void {
  const s = state();
  while (s.running < MAX_CONCURRENT) {
    const claim = claimNextPendingJob();
    if (!claim) break;
    s.running++;
    s.executor(claim.scriptId)
      .then(() => setJobStatus(claim.id, 'done'))
      .catch((err: Error) => setJobStatus(claim.id, 'failed', err.message?.slice(0, 1000)))
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
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true});
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // deja mort
    }
  }
}

function runRemotionRender(propsPath: string, outAbs: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const q = (s: string) => `"${s}"`;
    const child = spawn(
      'npx',
      [
        'remotion',
        'render',
        'video/index.ts',
        'Slideshow',
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

async function defaultExecutor(scriptId: number): Promise<void> {
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

  const audioBase = path.join(mediaDir, `voice-${scriptId}`);
  const propsPath = path.join(mediaDir, `props-${scriptId}.json`);
  const outRel = `media/${script.productId}/video-${scriptId}.mp4`;
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

  const props = {
    images,
    scenes,
    timings,
    price: product.data.price,
    compareAtPrice: product.data.compareAtPrice,
    brand: product.data.vendor ?? product.data.title.split(' ')[0],
    audioFile: `media/${script.productId}/voice-${scriptId}.mp3`,
    musicFile,
    beatFrames,
    styleVariant: scriptId % 2 === 0 ? 'dark' : 'light',
  };
  await fs.writeFile(propsPath, JSON.stringify(props), 'utf8');

  await runRemotionRender(propsPath, outAbs);
  insertVideo(scriptId, outRel);

  // Succes : l'audio est encode dans le mp4, les intermediaires degagent.
  // (En echec, on les garde volontairement pour le debug.)
  await Promise.allSettled([
    fs.rm(propsPath, {force: true}),
    fs.rm(`${audioBase}.mp3`, {force: true}),
    fs.rm(`${audioBase}.words.json`, {force: true}),
  ]);
}
