import {NextResponse} from 'next/server';
import {getProduct, listScripts, listVideos, listJobs} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const product = getProduct(id);
  if (!product) {
    return NextResponse.json({error: 'Produit introuvable'}, {status: 404});
  }
  return NextResponse.json({
    product,
    scripts: listScripts(id),
    videos: listVideos(id),
    jobs: listJobs(id),
  });
}
