import {NextResponse} from 'next/server';
import {getProduct, markAllVideosPosted} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || !getProduct(id)) {
    return NextResponse.json({error: 'Produit introuvable'}, {status: 404});
  }
  const marked = markAllVideosPosted(id);
  return NextResponse.json({marked});
}
