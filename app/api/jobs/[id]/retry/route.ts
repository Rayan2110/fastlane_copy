import {NextResponse} from 'next/server';
import {getJob, hasActiveJobForScript} from '@/lib/db';
import {enqueueRender} from '@/lib/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, {params}: {params: {id: string}}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({error: 'Id de job invalide'}, {status: 400});
  }
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({error: 'Job introuvable'}, {status: 404});
  }
  if (hasActiveJobForScript(job.scriptId)) {
    return NextResponse.json(
      {error: 'Un rendu est déjà en cours pour ce script'},
      {status: 409}
    );
  }
  const jobId = enqueueRender(job.scriptId);
  return NextResponse.json({jobId});
}
