import {spawn} from 'node:child_process';

// Extrait le premier bloc JSON ({...} ou [...]) d'une sortie de LLM,
// en tolerant les fences markdown et le texte autour.
export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : raw;
  const start = source.search(/[[{]/);
  if (start === -1) throw new Error('Aucun JSON trouvé dans la réponse');
  const open = source[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (escaped) {
      escaped = false;
    } else if (c === '\\') {
      escaped = true;
    } else if (c === '"') {
      inString = !inString;
    } else if (!inString) {
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          return JSON.parse(source.slice(start, i + 1)) as T;
        }
      }
    }
  }
  throw new Error('JSON incomplet dans la réponse');
}

// Appelle le CLI claude en mode headless. Utilise l'abonnement Claude
// existant — pas de cle API necessaire.
export function runClaude(
  prompt: string,
  opts: {timeoutMs?: number} = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'json'], {
      shell: true, // requis sous Windows (claude.cmd)
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude CLI: timeout après ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new Error(
          "claude CLI introuvable. Installe Claude Code (npm i -g @anthropic-ai/claude-code) et connecte-toi."
        )
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude CLI a échoué (code ${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {result?: string};
        if (typeof parsed.result !== 'string') {
          reject(new Error('Réponse claude CLI sans champ result'));
          return;
        }
        resolve(parsed.result);
      } catch {
        reject(new Error(`Sortie claude CLI illisible: ${stdout.slice(0, 300)}`));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
