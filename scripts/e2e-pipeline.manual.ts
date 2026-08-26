// Test d'integration MANUEL du pipeline aval (TTS -> timeline -> rendu -> DB),
// sans Claude. Ne fait pas partie de `npm test` (dossier scripts/, pas tests/).
// Usage: npx vitest run scripts/e2e-pipeline.manual.ts --testTimeout=600000
import {it, expect} from 'vitest';
import {openDb, getProduct, insertScript, getJob, listVideos} from '../lib/db';
import {enqueueRender} from '../lib/render';

it('rend une video complete pour le produit 1', async () => {
  openDb();
  const product = getProduct(1);
  expect(product, 'Produit 1 introuvable — lancer l’ingestion d’abord').toBeDefined();
  console.log(`Produit: ${product!.data.title} (${product!.data.localImages?.length} images)`);

  const scriptId = insertScript(1, {
    angle: 'test-pipeline',
    hook: 'Réveillé en sursaut chaque matin ?',
    scenes: [
      {
        imageIndex: 2,
        screenText: 'Réveil en sursaut ?',
        voiceText: 'Tu te réveilles encore avec une sonnerie stressante ?',
      },
      {
        imageIndex: 0,
        screenText: 'Vibration douce',
        voiceText: 'Ce bracelet te réveille par une douce vibration au poignet.',
      },
      {
        imageIndex: 4,
        screenText: 'Zéro bruit',
        voiceText: 'Aucun bruit, personne d’autre ne se réveille à côté de toi.',
      },
      {
        imageIndex: 6,
        screenText: 'Promo',
        voiceText:
          'En ce moment il est à trente-neuf euros quatre-vingt-dix au lieu de cinquante-neuf.',
      },
    ],
    cta: 'Fonce, le lien est en bio.',
  });

  const jobId = enqueueRender(scriptId);
  console.log(`Script ${scriptId}, job ${jobId} — rendu en cours…`);

  await new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      const job = getJob(jobId);
      if (!job) return;
      if (job.status === 'done') {
        clearInterval(timer);
        resolve();
      }
      if (job.status === 'failed') {
        clearInterval(timer);
        reject(new Error(job.error ?? 'echec sans message'));
      }
    }, 2000);
  });

  const videos = listVideos(1);
  console.log(`OK — video: ${videos[0]?.filePath}`);
  expect(videos.length).toBeGreaterThan(0);
}, 600_000);
