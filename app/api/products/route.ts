import {NextResponse} from 'next/server';
import {extractProduct} from '@/lib/extract';
import {downloadImages} from '@/lib/media';
import {insertProduct, listProducts, updateProductData} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({products: listProducts()});
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
  try {
    const product = await extractProduct(url);
    const id = insertProduct(product);
    const localImages = await downloadImages(product.images, id);
    updateProductData(id, {...product, localImages});
    return NextResponse.json({id});
  } catch (err) {
    return NextResponse.json({error: (err as Error).message}, {status: 422});
  }
}
