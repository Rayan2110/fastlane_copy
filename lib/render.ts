import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createJob, setJobStatus, getScript, getProduct, insertVideo} from './db';
import {synthesize} from './tts';

const MAX_CONCURRENT = 2;
const RENDER_CONCURRENCY = Math.max(4, Math.floor(os.cpus().length / 2));

type Executor = (scriptId: number) => Promise<void>;

let executor: Executor = defaultExecutor;

// Injection pour les tests de file.
export function setExecutor(fn: Executor): void {
  executor = fn;
}

let running = 0;
const pending: {scriptId: number; jobId: number}[] = [];

export function enqueueRender(scriptId: number): number {
  const jobId = createJob(scriptId);
  pending.push({scriptId, jobId});
  pump();
  return jobId;
}

function pump(): void {
  while (running < MAX_CONCURRENT && pending.length > 0) {
    const {scriptId, jobId} = pending.shift()!;
    running++;
    setJobStatus(jobId, 'running');
    executor(scriptId)
      .then(() => setJobStatus(jobId, 'done'))
      .catch((err: Error) => setJobStatus(jobId, 'failed', err.message?.slice(0, 1000)))
      .finally(() => {
        running--;
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

async function defaultExecutor(scriptId: number): Promise<void> {
  const script = getScript(scriptId);
  if (!script) throw new Error(`Script ${scriptId} introuvable`);
  const product = getProduct(script.productId);
  if (!product) throw new Error(`Produit ${script.productId} introuvable`);

  const mediaDir = path.join(process.cwd(), 'public', 'media', String(script.productId));
  await fs.mkdir(mediaDir, {recursive: true});

  // 1. Voix off complete (hook implicite dans la premiere scene + cta)
  const voiceText = [...script.data.scenes.map((s) => s.voiceText), script.data.cta].join(' ');
  const audioBase = path.join(mediaDir, `voice-${scriptId}`);
  const {timings} = await synthesize(voiceText, audioBase);

  // 2. Props du template
  const images: string[] = product.data.localImages ?? [];
  if (images.length === 0) throw new Error('Aucune image locale pour ce produit');
  const props = {
    images,
    scenes: script.data.scenes,
    timings,
    price: product.data.price,
    compareAtPrice: product.data.compareAtPrice,
    brand: product.data.vendor ?? product.data.title.split(' ')[0],
    audioFile: `media/${script.productId}/voice-${scriptId}.mp3`,
    musicFile: await pickMusicFile(),
    styleVariant: scriptId % 2 === 0 ? 'dark' : 'light',
  };
  const propsPath = path.join(mediaDir, `props-${scriptId}.json`);
  await fs.writeFile(propsPath, JSON.stringify(props), 'utf8');

  // 3. Rendu Remotion
  const outRel = `media/${script.productId}/video-${scriptId}.mp4`;
  const outAbs = path.join(process.cwd(), 'public', outRel);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        'remotion',
        'render',
        'video/index.ts',
        'Slideshow',
        outAbs,
        `--props=${propsPath}`,
        `--concurrency=${RENDER_CONCURRENCY}`,
        '--log=error',
      ],
      {shell: true, windowsHide: true, cwd: process.cwd()}
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`remotion render code ${code}: ${stderr.slice(-800)}`));
    });
  });

  insertVideo(scriptId, outRel);
}
