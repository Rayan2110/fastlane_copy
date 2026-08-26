import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import type {WordTiming} from './types';

export const DEFAULT_VOICE = 'fr-FR-VivienneMultilingualNeural';

// Genere <outBase>.mp3 + <outBase>.words.json via scripts/tts.py et
// retourne le chemin audio et les timings mot par mot.
export function synthesize(
  text: string,
  outBase: string,
  voice: string = DEFAULT_VOICE
): Promise<{audioPath: string; timings: WordTiming[]}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python',
      ['scripts/tts.py', '--voice', voice, '--text', text, '--out', outBase],
      {shell: false, windowsHide: true, cwd: process.cwd()}
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () =>
      reject(new Error('python introuvable — requis pour la voix off (edge-tts)'))
    );
    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`edge-tts a échoué: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const raw = await fs.readFile(`${outBase}.words.json`, 'utf8');
        const timings = JSON.parse(raw) as WordTiming[];
        if (timings.length === 0) {
          reject(new Error('edge-tts n’a retourné aucun timing de mot'));
          return;
        }
        resolve({audioPath: `${outBase}.mp3`, timings});
      } catch (err) {
        reject(err);
      }
    });
  });
}
