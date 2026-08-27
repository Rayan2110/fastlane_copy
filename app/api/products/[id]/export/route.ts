import path from 'node:path';
import fs from 'node:fs';
import {PassThrough, Readable} from 'node:stream';
import {ZipArchive} from 'archiver';
import {getProduct, listScripts, listVideos} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(s: string, max = 40): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, max);
}

// ZIP des videos non publiees, avec des noms de fichiers parlants :
// <produit>_<angle>_<hook>.mp4 — le nom sert de memo pour la legende.
export async function GET(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const product = Number.isInteger(id) ? getProduct(id) : undefined;
  if (!product) {
    return new Response(JSON.stringify({error: 'Produit introuvable'}), {status: 404});
  }
  const scriptById = new Map(listScripts(id).map((s) => [s.id, s]));
  const unposted = listVideos(id).filter((v) => !v.posted);
  if (unposted.length === 0) {
    return new Response(JSON.stringify({error: 'Aucune vidéo non publiée à exporter'}), {
      status: 404,
    });
  }

  const archive = new ZipArchive({zlib: {level: 0}}); // mp4 deja compresses
  const out = new PassThrough();
  archive.pipe(out);

  const productSlug = slugify(product.data.title) || `produit-${id}`;
  const seen = new Set<string>();
  for (const video of unposted) {
    const abs = path.join(process.cwd(), 'public', video.filePath);
    if (!fs.existsSync(abs)) continue;
    const script = scriptById.get(video.scriptId);
    let name = script
      ? `${productSlug}_${slugify(script.data.angle, 20)}_${slugify(script.data.hook)}.mp4`
      : `${productSlug}_video-${video.id}.mp4`;
    if (seen.has(name)) name = name.replace(/\.mp4$/, `_${video.id}.mp4`);
    seen.add(name);
    archive.file(abs, {name});
  }
  void archive.finalize();

  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${productSlug}-videos.zip"`,
    },
  });
}
