import {describe, it, expect} from 'vitest';
import {assignWordsToScenes, computeTimeline, computeShots} from '../lib/timeline';
import type {Scene, WordTiming} from '../lib/types';

function words(count: number, msPerWord = 300): WordTiming[] {
  return Array.from({length: count}, (_, i) => ({
    word: `mot${i}`,
    startMs: i * msPerWord,
    endMs: (i + 1) * msPerWord,
  }));
}

function scene(wordCount: number): Scene {
  return {
    imageIndex: 0,
    screenText: 'x',
    voiceText: Array.from({length: wordCount}, (_, i) => `w${i}`).join(' '),
  };
}

describe('assignWordsToScenes', () => {
  it('repartit proportionnellement au nombre de mots', () => {
    const groups = assignWordsToScenes([scene(5), scene(5)], words(10));
    expect(groups[0]).toHaveLength(5);
    expect(groups[1]).toHaveLength(5);
  });

  it('la derniere scene recupere le reste', () => {
    const groups = assignWordsToScenes([scene(3), scene(3)], words(10));
    expect(groups[0].length + groups[1].length).toBe(10);
    expect(groups[1][groups[1].length - 1].word).toBe('mot9');
  });
});

describe('computeTimeline', () => {
  const fps = 30;

  it('cale la frontiere de scene sur la fin du dernier mot assigne', () => {
    const {sceneFrames} = computeTimeline([scene(5), scene(5)], words(10), fps);
    // 5 mots * 300ms = 1500ms -> frame 45
    expect(sceneFrames[0].from).toBe(0);
    expect(sceneFrames[0].duration).toBe(45);
    expect(sceneFrames[1].from).toBe(45);
  });

  it('impose un minimum de 45 frames par scene', () => {
    // scene 1: 1 mot (300ms = 9 frames) -> etendue a 45
    const {sceneFrames} = computeTimeline([scene(1), scene(9)], words(10), fps);
    expect(sceneFrames[0].duration).toBeGreaterThanOrEqual(45);
  });

  it('ajoute 1 seconde de padding a la fin', () => {
    const {totalFrames, sceneFrames} = computeTimeline([scene(5), scene(5)], words(10), fps);
    const lastEnd = sceneFrames[1].from + sceneFrames[1].duration;
    expect(totalFrames).toBe(lastEnd + fps);
  });

  it('les scenes sont contigues', () => {
    const {sceneFrames} = computeTimeline([scene(2), scene(4), scene(4)], words(10), fps);
    for (let i = 1; i < sceneFrames.length; i++) {
      expect(sceneFrames[i].from).toBe(sceneFrames[i - 1].from + sceneFrames[i - 1].duration);
    }
  });
});

describe('computeShots', () => {
  const opts = {maxShotFrames: 60, minShotFrames: 24};
  const twoScenes: Scene[] = [
    {imageIndex: 0, screenText: 'a', voiceText: 'x'},
    {imageIndex: 2, screenText: 'b', voiceText: 'y'},
  ];

  it('decoupe une scene longue en sous-plans <= max, contigus et couvrant tout', () => {
    const shots = computeShots(twoScenes, [{from: 0, duration: 150}, {from: 150, duration: 50}], 5, opts);
    const first = shots.filter((s) => s.sceneIndex === 0);
    expect(first.length).toBe(3); // ceil(150/60)
    for (const s of first) {
      expect(s.duration).toBeLessThanOrEqual(60);
      expect(s.duration).toBeGreaterThanOrEqual(24);
    }
    // contigus et couvrant [0, 200)
    let cursor = 0;
    for (const s of shots) {
      expect(s.from).toBe(cursor);
      cursor += s.duration;
    }
    expect(cursor).toBe(200);
  });

  it('une scene courte reste un seul plan', () => {
    const shots = computeShots(twoScenes, [{from: 0, duration: 40}, {from: 40, duration: 45}], 5, opts);
    expect(shots.filter((s) => s.sceneIndex === 0)).toHaveLength(1);
    expect(shots[0].duration).toBe(40);
  });

  it('le premier plan garde l image de la scene puis cycle', () => {
    const shots = computeShots(twoScenes, [{from: 0, duration: 150}, {from: 150, duration: 50}], 5, opts);
    const first = shots.filter((s) => s.sceneIndex === 0);
    expect(first[0].imageIndex).toBe(0);
    expect(first[1].imageIndex).toBe(1); // (0+1) % 5
    expect(first[2].imageIndex).toBe(2);
    expect(shots.find((s) => s.sceneIndex === 1)!.imageIndex).toBe(2);
  });

  it('snap les coupes sur les beats quand ils sont fournis', () => {
    const beatFrames = [0, 38, 76, 114, 152, 190];
    const shots = computeShots(
      twoScenes,
      [{from: 0, duration: 150}, {from: 150, duration: 50}],
      5,
      {...opts, beatFrames}
    );
    const first = shots.filter((s) => s.sceneIndex === 0);
    // les coupes internes de la scene 0 tombent sur des beats
    expect(first[0].from + first[0].duration).toBe(38);
    expect(first[1].from + first[1].duration).toBe(76);
  });
});
