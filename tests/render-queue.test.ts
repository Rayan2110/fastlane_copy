import {describe, it, expect, beforeEach} from 'vitest';
import {openDb, insertProduct, insertScript, getJob} from '../lib/db';
import {enqueueRender, setExecutor} from '../lib/render';
import {sampleProduct, sampleScript} from './fixtures/sample';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

async function tick() {
  await new Promise((r) => setTimeout(r, 10));
}

describe('render queue', () => {
  let scriptIds: number[];

  beforeEach(() => {
    openDb(':memory:');
    const pid = insertProduct(sampleProduct);
    scriptIds = Array.from({length: 5}, () => insertScript(pid, sampleScript));
  });

  it('ne lance jamais plus de 2 rendus en parallele', async () => {
    let running = 0;
    let maxRunning = 0;
    const gates = scriptIds.map(() => deferred());
    let started = 0;
    setExecutor(async () => {
      const gate = gates[started++];
      running++;
      maxRunning = Math.max(maxRunning, running);
      await gate.promise;
      running--;
    });

    const jobIds = scriptIds.map((id) => enqueueRender(id));
    await tick();
    expect(maxRunning).toBe(2);
    gates.forEach((g) => g.resolve());
    await tick();
    expect(maxRunning).toBe(2);
    for (const jid of jobIds) {
      expect(getJob(jid)!.status).toBe('done');
    }
  });

  it('marque failed avec le message d erreur', async () => {
    setExecutor(async () => {
      throw new Error('rendu explose');
    });
    const jid = enqueueRender(scriptIds[0]);
    await tick();
    const job = getJob(jid)!;
    expect(job.status).toBe('failed');
    expect(job.error).toContain('rendu explose');
  });

  it('passe les jobs par running avant done', async () => {
    const gate = deferred();
    setExecutor(async () => {
      await gate.promise;
    });
    const jid = enqueueRender(scriptIds[0]);
    await tick();
    expect(getJob(jid)!.status).toBe('running');
    gate.resolve();
    await tick();
    expect(getJob(jid)!.status).toBe('done');
  });
});
