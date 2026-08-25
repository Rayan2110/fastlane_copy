import {NextResponse} from 'next/server';
import {setVideoPosted} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const {posted} = (await req.json()) as {posted: boolean};
  setVideoPosted(id, posted);
  return NextResponse.json({ok: true});
}
