import {NextResponse} from 'next/server';
import {getProduct} from '@/lib/db';
import {generateBrollClip} from '@/lib/broll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Anime une image produit en clip B-roll (~0,11 $ sur les credits fal).
export async function POST(req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || !getProduct(id)) {
    return NextResponse.json({error: 'Produit introuvable'}, {status: 404});
  }
  let imageIndex: number;
  let tier: 'eco' | 'quality' | 'premium' = 'eco';
  try {
    const body = (await req.json()) as {imageIndex: number; tier?: typeof tier};
    imageIndex = body.imageIndex;
    if (body.tier && ['eco', 'quality', 'premium'].includes(body.tier)) tier = body.tier;
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {imageIndex}'}, {status: 400});
  }
  if (!Number.isInteger(imageIndex) || imageIndex < 0) {
    return NextResponse.json({error: 'imageIndex invalide'}, {status: 400});
  }
  try {
    const path = await generateBrollClip(id, imageIndex, tier);
    return NextResponse.json({path});
  } catch (err) {
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}
