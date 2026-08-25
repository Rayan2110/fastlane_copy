import {NextResponse} from 'next/server';
import {getProduct, insertScript} from '@/lib/db';
import {generateScripts} from '@/lib/scripts-gen';
import {enqueueRender} from '@/lib/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const product = getProduct(id);
  if (!product) {
    return NextResponse.json({error: 'Produit introuvable'}, {status: 404});
  }
  let count = 5;
  try {
    const body = (await req.json()) as {count?: number};
    if (body.count) count = Math.min(Math.max(1, body.count), 30);
  } catch {
    // body vide -> defaut
  }
  try {
    const scripts = await generateScripts(product.data, count);
    const scriptIds = scripts.map((s) => insertScript(id, s));
    const jobIds = scriptIds.map((sid) => enqueueRender(sid));
    return NextResponse.json({scriptIds, jobIds});
  } catch (err) {
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}
