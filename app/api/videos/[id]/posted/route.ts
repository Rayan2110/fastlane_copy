import {NextResponse} from 'next/server';
import {setVideoPosted} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({error: 'Id de vidéo invalide'}, {status: 400});
  }
  let posted: boolean;
  try {
    ({posted} = (await req.json()) as {posted: boolean});
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {posted}'}, {status: 400});
  }
  setVideoPosted(id, Boolean(posted));
  return NextResponse.json({ok: true});
}
