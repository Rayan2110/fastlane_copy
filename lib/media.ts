import fs from 'node:fs/promises';
import path from 'node:path';

// Telecharge les images produit vers public/media/<productId>/.
// Retourne les URLs sources reussies ET les chemins locaux, dans le meme
// ordre : les deux tableaux restent alignes index par index (les scripts
// referencent les images par index).
export async function downloadImages(
  urls: string[],
  productId: number
): Promise<{sourceUrls: string[]; localImages: string[]}> {
  const dir = path.join(process.cwd(), 'public', 'media', String(productId));
  await fs.mkdir(dir, {recursive: true});
  const sourceUrls: string[] = [];
  const localImages: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i], {
        headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) continue; // page d'erreur HTML en 200, etc.
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5_000) continue; // vignettes/pixels de tracking
      const file = `img-${i}.jpg`;
      await fs.writeFile(path.join(dir, file), buf);
      sourceUrls.push(urls[i]);
      localImages.push(`media/${productId}/${file}`);
    } catch {
      // image individuelle en echec -> on continue avec les autres
    }
  }
  if (localImages.length === 0) {
    throw new Error('Aucune image produit téléchargeable');
  }
  return {sourceUrls, localImages};
}
