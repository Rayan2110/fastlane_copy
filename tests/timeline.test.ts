import {describe, it, expect} from 'vitest';
import {assignWordsToScenes, computeTimeline} from '../lib/timeline';
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
