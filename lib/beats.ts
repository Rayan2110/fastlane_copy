import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import MusicTempo from 'music-tempo';

const SAMPLE_RATE = 44100; // music-tempo suppose du 44,1 kHz
const DECODE_TIMEOUT_MS = 60_000;

function decodePcm(absPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-v', 'error', '-i', absPath, '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), 'pipe:1'],
      {shell: false, windowsHide: true}
    );
    const chunks: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('ffmpeg: timeout de décodage audio'));
    }, DECODE_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg decode: ${stderr.slice(0, 300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

// Detecte les beats d'une musique (chemin relatif a public/) et les met en
// cache dans un sidecar .beats.json. Retourne des secondes.
export async function detectBeats(musicRelPath: string): Promise<number[]> {
  const abs = path.join(process.cwd(), 'public', musicRelPath);
  const cachePath = `${abs}.beats.json`;

  try {
    const [cacheStat, audioStat] = await Promise.all([fs.stat(cachePath), fs.stat(abs)]);
    if (cacheStat.mtimeMs >= audioStat.mtimeMs) {
      return JSON.parse(await fs.readFile(cachePath, 'utf8')) as number[];
    }
  } catch {
    // pas de cache -> on calcule
  }

  const pcm = await decodePcm(abs);
  const mt = new MusicTempo(pcm);
  const beats = mt.beats ?? [];
  await fs.writeFile(cachePath, JSON.stringify(beats), 'utf8');
  return beats;
}
