import {NextResponse} from 'next/server';
import {getScript, hasActiveJobForScript} from '@/lib/db';
import {enqueueRender} from '@/lib/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lance le rendu des scripts selectionnes (ignore ceux deja en cours).
export async function POST(req: Request) {
  let scriptIds: number[];
  try {
    ({scriptIds} = (await req.json()) as {scriptIds: number[]});
  } catch {
    return NextResponse.json({error: 'Body JSON attendu: {scriptIds}'}, {status: 400});
  }
  if (!Array.isArray(scriptIds) || scriptIds.length === 0) {
    return NextResponse.json({error: 'Aucun script sélectionné'}, {status: 400});
  }
  const jobIds: number[] = [];
  const skipped: number[] = [];
  for (const sid of scriptIds) {
    if (!Number.isInteger(sid) || !getScript(sid)) continue;
    if (hasActiveJobForScript(sid)) {
      skipped.push(sid);
      continue;
    }
    jobIds.push(enqueueRender(sid));
  }
  return NextResponse.json({jobIds, skipped});
}
