import {NextResponse} from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {extractProduct} from '@/lib/extract';
import {downloadImages} from '@/lib/media';
import {
  insertProduct,
  listProducts,
  updateProductData,
  deleteProduct,
  listVideoCounts,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tolere les URLs collees sans protocole ("maboutique.com/products/x").
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function GET() {
  return NextResponse.json({products: listProducts(), videoCounts: listVideoCounts()});
}

export async function POST(req: Request) {
  let url: string;
  try {
    ({url} = (await req.json()) as {url: string});
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {url}'}, {status: 400});
  }
  if (!url) {
    return NextResponse.json({error: 'URL manquante'}, {status: 400});
  }
  let id: number | undefined;
  try {
    const product = await extractProduct(normalizeUrl(url));
    id = insertProduct(product);
    const {sourceUrls, localImages} = await downloadImages(product.images, id);
    // images et localImages restent alignes : les scripts indexent dedans.
    updateProductData(id, {...product, images: sourceUrls, localImages});
    return NextResponse.json({id});
  } catch (err) {
    if (id !== undefined) {
      // pas de carte morte dans le dashboard, ni de dossier orphelin
      deleteProduct(id);
      await fs.rm(path.join(process.cwd(), 'public', 'media', String(id)), {
        recursive: true,
        force: true,
      });
    }
    const message = (err as Error).message;
    const friendly = /fetch failed|Failed to parse URL|ENOTFOUND|ECONNREFUSED/i.test(message)
      ? `Impossible d'atteindre cette URL. Vérifie l'adresse (elle doit pointer vers une page produit accessible publiquement). Détail: ${message}`
      : message;
    return NextResponse.json({error: friendly}, {status: 422});
  }
}
