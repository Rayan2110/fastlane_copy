import {z} from 'zod';
import type {ProductData, VideoScript} from './types';
import {runClaude, extractJson} from './claude';

const SceneSchema = z.object({
  imageIndex: z.number().int().min(0),
  screenText: z.string().min(1).max(60),
  voiceText: z.string().min(5),
  emphasisWords: z.array(z.string()).max(6).optional(),
  emoji: z.string().max(8).optional(),
});

const ScriptSchema = z.object({
  angle: z.string().min(1),
  hook: z.string().min(1),
  scenes: z.array(SceneSchema).min(2).max(6),
  cta: z.string().min(1),
});

const ANGLES =
  'curiosité, problème/solution, preuve sociale, urgence/promo, démonstration, comparaison avant/après, storytelling';

export function buildScriptsPrompt(product: ProductData, count: number): string {
  const imageList = product.images
    .map((_, i) => `${i}`)
    .join(', ');
  return `Tu es un expert en publicités TikTok/Reels pour le dropshipping francophone.

PRODUIT:
- Titre: ${product.title}
- Prix: ${product.price ? `${product.price}${product.compareAtPrice ? ` (au lieu de ${product.compareAtPrice})` : ''}` : 'non affiché — NE PAS inventer de prix, ne pas en parler'}
- Description: ${product.description}
- Bénéfices: ${product.benefits.join(' | ')}
- Images disponibles (index): ${imageList}

TÂCHE: écris ${count} scripts de vidéos verticales de 20-30 secondes, chacun avec un ANGLE MARKETING DIFFÉRENT parmi: ${ANGLES}.

RÈGLES STRICTES:
- Français parlé naturel, tutoiement, phrases courtes.
- Chaque script: 3 à 5 scènes.
- "voiceText" par scène: 1-2 phrases (le total du script fait 35-60 mots).
- "screenText" par scène: maximum 6 mots, percutant.
- "imageIndex": un entier entre 0 et ${product.images.length - 1}, varie les images entre les scènes.
- Le hook (première scène) doit arrêter le scroll en 2 secondes.
${product.price ? `- Dernière scène: mentionne le prix${product.compareAtPrice ? ' et la promo' : ''}.` : '- Dernière scène: pousse vers le lien en bio, sans mentionner de prix.'}
- "cta": phrase courte finissant par "lien en bio".

Réponds UNIQUEMENT avec un tableau JSON:
[
  {
    "angle": "nom de l'angle",
    "hook": "phrase d'accroche",
    "scenes": [
      {"imageIndex": 0, "screenText": "texte écran", "voiceText": "texte voix off", "emphasisWords": ["mots", "forts"], "emoji": "🔥"}
    ],
    "cta": "appel à l'action"
  }
]

Pour chaque scène: "emphasisWords" = 1-3 mots du voiceText à faire ressortir visuellement (bénéfice clé, chiffre, prix), "emoji" = un emoji pertinent pour le texte écran (optionnel).`;
}

export function parseScripts(raw: string, imageCount: number): VideoScript[] {
  const arr = extractJson<unknown>(raw);
  if (!Array.isArray(arr)) throw new Error('La réponse ne contient pas un tableau de scripts');
  const valid: VideoScript[] = [];
  for (const item of arr) {
    const parsed = ScriptSchema.safeParse(item);
    if (!parsed.success) continue;
    const script = parsed.data;
    valid.push({
      ...script,
      scenes: script.scenes.map((s) => ({
        ...s,
        imageIndex: Math.min(s.imageIndex, Math.max(0, imageCount - 1)),
      })),
    });
  }
  if (valid.length === 0) throw new Error('Aucun script valide dans la réponse de Claude');
  return valid;
}

async function generateBatch(product: ProductData, count: number): Promise<VideoScript[]> {
  const prompt = buildScriptsPrompt(product, count);
  const raw = await runClaude(prompt);
  try {
    return parseScripts(raw, product.images.length);
  } catch (err) {
    const retryRaw = await runClaude(
      `${prompt}\n\nATTENTION: ta réponse précédente était invalide (${(err as Error).message}). Réponds STRICTEMENT avec le tableau JSON demandé, sans aucun texte autour.`
    );
    return parseScripts(retryRaw, product.images.length);
  }
}

const BATCH_SIZE = 5; // au-dela, la reponse JSON risque la troncature
const BATCH_CONCURRENCY = 2; // appels claude CLI simultanes max

export type GenerateResult = {scripts: VideoScript[]; failedBatches: number};

export async function generateScripts(
  product: ProductData,
  count: number
): Promise<GenerateResult> {
  const batches: number[] = [];
  for (let rest = count; rest > 0; rest -= BATCH_SIZE) {
    batches.push(Math.min(BATCH_SIZE, rest));
  }

  // Petite pool : un batch en echec ne jette pas les autres.
  const scripts: VideoScript[] = [];
  let failedBatches = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < batches.length) {
      const n = batches[cursor++];
      try {
        scripts.push(...(await generateBatch(product, n)));
      } catch {
        failedBatches++;
      }
    }
  };
  await Promise.all(
    Array.from({length: Math.min(BATCH_CONCURRENCY, batches.length)}, worker)
  );

  if (scripts.length === 0) {
    throw new Error('La génération de scripts a échoué (tous les batchs en erreur)');
  }
  return {scripts: scripts.slice(0, count), failedBatches};
}
