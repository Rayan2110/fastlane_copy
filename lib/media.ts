import fs from 'node:fs/promises';
import path from 'node:path';

// Telecharge les images produit vers public/media/<productId>/ et
// retourne les chemins relatifs a public/ (format attendu par staticFile).
export async function downloadImages(urls: string[], productId: number): Promise<string[]> {
  const dir = path.join(process.cwd(), 'public', 'media', String(productId));
  await fs.mkdir(dir, {recursive: true});
  const saved: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i], {
        headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'},
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5_000) continue; // vignettes/pixels de tracking
      const file = `img-${i}.jpg`;
      await fs.writeFile(path.join(dir, file), buf);
      saved.push(`media/${productId}/${file}`);
    } catch {
      // image individuelle en echec -> on continue avec les autres
    }
  }
  if (saved.length === 0) {
    throw new Error('Aucune image produit téléchargeable');
  }
  return saved;
}
