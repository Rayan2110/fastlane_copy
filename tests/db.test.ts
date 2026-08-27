import {describe, it, expect, beforeEach} from 'vitest';
import {
  openDb,
  insertProduct,
  getProduct,
  listProducts,
  insertScript,
  listScripts,
  insertVideo,
  listVideos,
  setVideoPosted,
  createJob,
  getJob,
  setJobStatus,
  listJobs,
  deleteProduct,
  claimNextPendingJob,
  failRunningJobs,
  updateScriptData,
  listVideoCounts,
  markAllVideosPosted,
} from '../lib/db';
import {sampleProduct, sampleScript} from './fixtures/sample';

describe('db', () => {
  beforeEach(() => {
    openDb(':memory:');
  });

  it('stocke et relit un produit', () => {
    const id = insertProduct(sampleProduct);
    const row = getProduct(id);
    expect(row).toBeDefined();
    expect(row!.data.title).toBe(sampleProduct.title);
    expect(listProducts()).toHaveLength(1);
  });

  it('retourne undefined pour un produit inconnu', () => {
    expect(getProduct(999)).toBeUndefined();
  });

  it('stocke des scripts lies a un produit', () => {
    const pid = insertProduct(sampleProduct);
    insertScript(pid, sampleScript);
    insertScript(pid, sampleScript);
    expect(listScripts(pid)).toHaveLength(2);
    expect(listScripts(pid)[0].data.hook).toBe(sampleScript.hook);
  });

  it('stocke des videos et le flag publie', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    const vid = insertVideo(sid, 'media/1/video-1.mp4');
    expect(listVideos(pid)).toHaveLength(1);
    expect(listVideos(pid)[0].posted).toBe(false);
    setVideoPosted(vid, true);
    expect(listVideos(pid)[0].posted).toBe(true);
  });

  it('supprime un produit', () => {
    const id = insertProduct(sampleProduct);
    deleteProduct(id);
    expect(getProduct(id)).toBeUndefined();
  });

  it('claimNextPendingJob reclame les jobs dans l ordre et les passe running', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    const j1 = createJob(sid);
    const j2 = createJob(sid);
    expect(claimNextPendingJob()).toEqual({
      id: j1,
      scriptId: sid,
      format: 'slideshow',
      avatarId: null,
      tier: 'eco',
    });
    expect(getJob(j1)!.status).toBe('running');
    expect(claimNextPendingJob()).toEqual({
      id: j2,
      scriptId: sid,
      format: 'slideshow',
      avatarId: null,
      tier: 'eco',
    });
    expect(claimNextPendingJob()).toBeUndefined();
  });

  it('failRunningJobs requalifie les jobs orphelins', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    const j1 = createJob(sid);
    claimNextPendingJob();
    const n = failRunningJobs('interrompu');
    expect(n).toBe(1);
    expect(getJob(j1)!.status).toBe('failed');
    expect(getJob(j1)!.error).toBe('interrompu');
  });

  it('met a jour un script en place', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    updateScriptData(sid, {...sampleScript, hook: 'Nouveau hook'});
    expect(listScripts(pid)[0].data.hook).toBe('Nouveau hook');
  });

  it('compte les videos et marque tout publie', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    insertVideo(sid, 'a.mp4');
    const v2 = insertVideo(sid, 'b.mp4');
    setVideoPosted(v2, true);
    expect(listVideoCounts()[pid]).toEqual({total: 2, unposted: 1});
    expect(markAllVideosPosted(pid)).toBe(1);
    expect(listVideoCounts()[pid]).toEqual({total: 2, unposted: 0});
  });

  it('cycle de vie job', () => {
    const pid = insertProduct(sampleProduct);
    const sid = insertScript(pid, sampleScript);
    const jid = createJob(sid);
    expect(getJob(jid)!.status).toBe('pending');
    setJobStatus(jid, 'running');
    expect(getJob(jid)!.status).toBe('running');
    setJobStatus(jid, 'failed', 'boom');
    expect(getJob(jid)!.status).toBe('failed');
    expect(getJob(jid)!.error).toBe('boom');
    expect(listJobs(pid)).toHaveLength(1);
  });
});
