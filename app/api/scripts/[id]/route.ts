import {NextResponse} from 'next/server';
import {getScript, updateScriptData} from '@/lib/db';
import {ScriptSchema} from '@/lib/scripts-gen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Edition d'un script (hook, scenes, cta) depuis l'UI de revue.
export async function PATCH(req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || !getScript(id)) {
    return NextResponse.json({error: 'Script introuvable'}, {status: 404});
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: 'Body JSON attendu'}, {status: 400});
  }
  const parsed = ScriptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {error: `Script invalide: ${parsed.error.issues[0]?.message ?? 'format incorrect'}`},
      {status: 422}
    );
  }
  updateScriptData(id, parsed.data);
  return NextResponse.json({ok: true});
}
