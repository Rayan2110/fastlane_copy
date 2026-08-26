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
export type Shot = {from: number; duration: number; imageIndex: number; sceneIndex: number};

// Decoupe chaque scene en sous-plans courts (rythme TikTok), en cyclant les
// images du produit, et en calant les coupes sur les beats de la musique
// quand ils sont fournis.
export function computeShots(
  scenes: Scene[],
  sceneFrames: SceneFrame[],
  imageCount: number,
  opts: {maxShotFrames: number; minShotFrames: number; beatFrames?: number[]}
): Shot[] {
  const {maxShotFrames, minShotFrames, beatFrames} = opts;
  const shots: Shot[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const {from, duration} = sceneFrames[i];
    const end = from + duration;
    const cuts: number[] = [];

    if (beatFrames && beatFrames.length > 0) {
      // Greedy : coupe sur le dernier beat dans la fenetre [min, max].
      let start = from;
      while (end - start > maxShotFrames) {
        const candidates = beatFrames.filter(
          (b) => b > start + minShotFrames && b <= start + maxShotFrames
        );
        const cut = candidates.length > 0 ? candidates[candidates.length - 1] : start + maxShotFrames;
        cuts.push(cut);
        start = cut;
      }
      // Pas de plan de queue d'1-2 frames : on fusionne avec le precedent
      // (quitte a depasser legerement max, preferable a un blip).
      while (cuts.length > 0 && end - cuts[cuts.length - 1] < minShotFrames) {
        cuts.pop();
      }
    } else {
      // Sans musique : decoupe en parts egales <= max.
      const n = Math.ceil(duration / maxShotFrames);
      for (let k = 1; k < n; k++) {
        cuts.push(from + Math.round((duration * k) / n));
      }
    }

    const bounds = [from, ...cuts, end];
    for (let k = 0; k < bounds.length - 1; k++) {
      const shotDuration = bounds[k + 1] - bounds[k];
      if (shotDuration <= 0) continue;
      shots.push({
        from: bounds[k],
        duration: shotDuration,
        imageIndex: (scenes[i].imageIndex + k) % Math.max(1, imageCount),
        sceneIndex: i,
      });
    }
  }
  return shots;
}

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
