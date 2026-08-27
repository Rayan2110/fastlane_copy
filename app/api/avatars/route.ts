import {NextResponse} from 'next/server';
import {listAvatars} from '@/lib/db';
import {createAvatar, AVATAR_PRESETS} from '@/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({avatars: listAvatars(), presets: Object.keys(AVATAR_PRESETS)});
}

// Genere un portrait (~0,03 $ sur les credits fal).
export async function POST(req: Request) {
  let name: string, preset: string;
  try {
    const body = (await req.json()) as {name?: string; preset?: string; prompt?: string};
    name = (body.name ?? '').trim() || 'Avatar';
    preset = (body.prompt ?? '').trim() || body.preset || 'femme-20s';
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {name, preset|prompt}'}, {status: 400});
  }
  try {
    const avatar = await createAvatar(name, preset);
    return NextResponse.json({avatar});
  } catch (err) {
    return NextResponse.json({error: (err as Error).message}, {status: 500});
  }
}
