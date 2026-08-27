import {NextResponse} from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {getAvatar, deleteAvatar} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  const avatar = Number.isInteger(id) ? getAvatar(id) : undefined;
  if (!avatar) {
    return NextResponse.json({error: 'Avatar introuvable'}, {status: 404});
  }
  deleteAvatar(id);
  await fs.rm(path.join(process.cwd(), 'public', avatar.imagePath), {force: true});
  return NextResponse.json({ok: true});
}
