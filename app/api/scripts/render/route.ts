import {NextResponse} from 'next/server';
import {getScript, hasActiveJobForScript, getAvatar} from '@/lib/db';
import {enqueueRender} from '@/lib/render';
import type {RenderFormat} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lance le rendu des scripts selectionnes (ignore ceux deja en cours).
// format 'avatar' => avatarId obligatoire (coute des credits fal).
export async function POST(req: Request) {
  let scriptIds: number[];
  let format: RenderFormat = 'slideshow';
  let avatarId: number | undefined;
  try {
    const body = (await req.json()) as {
      scriptIds: number[];
      format?: RenderFormat;
      avatarId?: number;
    };
    scriptIds = body.scriptIds;
    if (body.format === 'avatar') format = 'avatar';
    avatarId = body.avatarId;
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {scriptIds}'}, {status: 400});
  }
  if (!Array.isArray(scriptIds) || scriptIds.length === 0) {
    return NextResponse.json({error: 'Aucun script sélectionné'}, {status: 400});
  }
  if (format === 'avatar') {
    if (!avatarId || !getAvatar(avatarId)) {
      return NextResponse.json(
        {error: 'Choisis un avatar (crée-en un sur la page Avatars)'},
        {status: 400}
      );
    }
  }
  const jobIds: number[] = [];
  const skipped: number[] = [];
  for (const sid of scriptIds) {
    if (!Number.isInteger(sid) || !getScript(sid)) continue;
    if (hasActiveJobForScript(sid)) {
      skipped.push(sid);
      continue;
    }
    jobIds.push(enqueueRender(sid, {format, avatarId}));
  }
  return NextResponse.json({jobIds, skipped});
}
