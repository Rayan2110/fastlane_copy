import {NextResponse} from 'next/server';
import {getScript, getProduct, updateScriptData, hasActiveJobForScript} from '@/lib/db';
import {regenerateScript} from '@/lib/scripts-gen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Remplace le contenu d'un script par une nouvelle version (meme angle).
export async function POST(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const script = Number.isInteger(id) ? getScript(id) : undefined;
  if (!script) {
    return NextResponse.json({error: 'Script introuvable'}, {status: 404});
  }
  if (hasActiveJobForScript(id)) {
    return NextResponse.json(
      {error: 'Un rendu est en cours pour ce script — attends la fin avant de régénérer'},
      {status: 409}
    );
  }
  const product = getProduct(script.productId);
  if (!product) {
    return NextResponse.json({error: 'Produit introuvable'}, {status: 404});
  }
  try {
    const fresh = await regenerateScript(product.data, script.data.angle);
    updateScriptData(id, fresh);
    return NextResponse.json({ok: true});
  } catch (err) {
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}
