import type {Scene, WordTiming} from './types';

const MIN_SCENE_FRAMES = 45; // 1,5 s a 30 fps
const TAIL_SECONDS = 1;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Repartit les timings mots sur les scenes proportionnellement au nombre
// de mots de chaque voiceText (les nombres reels de mots TTS peuvent
// differer legerement du texte ecrit : liaisons, nombres, etc.).
export function assignWordsToScenes(scenes: Scene[], timings: WordTiming[]): WordTiming[][] {
  const counts = scenes.map((s) => countWords(s.voiceText));
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const groups: WordTiming[][] = [];
  let cursor = 0;
  let allocated = 0;
  for (let i = 0; i < scenes.length; i++) {
    allocated += counts[i];
    const end =
      i === scenes.length - 1
        ? timings.length
        : Math.round((allocated / total) * timings.length);
    groups.push(timings.slice(cursor, Math.max(cursor, end)));
    cursor = Math.max(cursor, end);
  }
  return groups;
}

export type SceneFrame = {from: number; duration: number};

export function computeTimeline(
  scenes: Scene[],
  timings: WordTiming[],
  fps: number
): {sceneFrames: SceneFrame[]; totalFrames: number} {
  const groups = assignWordsToScenes(scenes, timings);
  const sceneFrames: SceneFrame[] = [];
  let cursor = 0;
  for (const group of groups) {
    const lastEndMs = group.length > 0 ? group[group.length - 1].endMs : 0;
    const naturalEnd = Math.round((lastEndMs / 1000) * fps);
    const end = Math.max(naturalEnd, cursor + MIN_SCENE_FRAMES);
    sceneFrames.push({from: cursor, duration: end - cursor});
    cursor = end;
  }
  return {sceneFrames, totalFrames: cursor + fps * TAIL_SECONDS};
}
