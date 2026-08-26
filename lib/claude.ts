import {spawn} from 'node:child_process';
import os from 'node:os';

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

// Le prompt contient du texte web arbitraire (extraction generique) : on
// interdit tous les outils au CLI pour neutraliser l'injection de prompt.
const DISALLOWED_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
];

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    // Avec shell:true, child.kill() tue cmd.exe mais pas claude en dessous.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true});
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // deja mort
    }
  }
}

// Appelle le CLI claude en mode headless. Utilise l'abonnement Claude
// existant — pas de cle API necessaire.
export function runClaude(
  prompt: string,
  opts: {timeoutMs?: number} = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'json', '--disallowedTools', ...DISALLOWED_TOOLS],
      {
        shell: true, // requis sous Windows (claude.cmd)
        windowsHide: true,
        cwd: os.tmpdir(), // cwd neutre : pas d'acces implicite au projet
      }
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(child.pid);
      reject(new Error(`claude CLI: timeout après ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          "claude CLI introuvable. Installe Claude Code (npm i -g @anthropic-ai/claude-code) et connecte-toi."
        )
      );
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        let detail = stderr.slice(0, 500);
        try {
          const parsed = JSON.parse(stdout) as {result?: string};
          if (parsed.result) detail = parsed.result.slice(0, 500);
        } catch {
          // stderr fera l'affaire
        }
        reject(new Error(`claude CLI a échoué (code ${code}): ${detail}`));
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
    // Si le CLI meurt immediatement, l'ecriture leve un EPIPE : sans ce
    // handler, l'event 'error' non gere ferait tomber tout le serveur.
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
