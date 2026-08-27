import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import type {Scene, WordTiming} from '../lib/types';
import {computeTimeline} from '../lib/timeline';
import {STYLE, THEMES, type StyleVariant} from './style';
import {Vignette, useCameraShake} from './fx';
import {
  Karaoke,
  PriceBlock,
  UrgencyBanner,
  Watermark,
  buildEmphasisSet,
  slideshowCalculateMetadata,
} from './Slideshow';

export type AvatarUGCProps = {
  avatarVideo: string; // clip Kling lip-synce, relatif a public/
  images: string[];
  scenes: Scene[];
  timings: WordTiming[];
  price: string;
  compareAtPrice?: string;
  brand: string;
  audioFile: string;
  musicFile?: string;
  brollClips?: Record<number, string>;
  styleVariant: StyleVariant;
};

export const avatarCalculateMetadata = ({props}: {props: AvatarUGCProps}) =>
  slideshowCalculateMetadata({props});

// Cutaway produit plein ecran pendant les scenes du milieu : masque les
// imperfections du lip-sync ET montre le produit — le pattern UGC standard.
const Cutaway: React.FC<{src: string; videoSrc?: string; duration: number; gradient: string}> = ({
  src,
  videoSrc,
  duration,
  gradient,
}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, duration], [1, 1 + STYLE.zoomStrength], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const shake = useCameraShake(duration);
  const fadeIn = interpolate(frame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});
  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    filter: STYLE.grade,
  };
  return (
    <AbsoluteFill style={{opacity: fadeIn}}>
      {videoSrc ? (
        <Loop durationInFrames={150}>
          <OffthreadVideo src={staticFile(videoSrc)} muted style={mediaStyle} />
        </Loop>
      ) : (
        <Img src={staticFile(src)} style={{...mediaStyle, transform: `scale(${zoom})${shake}`}} />
      )}
      <AbsoluteFill style={{background: gradient}} />
    </AbsoluteFill>
  );
};

export const AvatarUGC: React.FC<AvatarUGCProps> = ({
  avatarVideo,
  images,
  scenes,
  timings,
  price,
  compareAtPrice,
  brand,
  audioFile,
  musicFile,
  brollClips,
  styleVariant,
}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const theme = THEMES[styleVariant] ?? THEMES.dark;
  const {sceneFrames} = useMemo(() => computeTimeline(scenes, timings, fps), [scenes, timings, fps]);
  const emphasis = useMemo(() => buildEmphasisSet(scenes), [scenes]);
  const frame = useCurrentFrame();
  const lastSceneIndex = scenes.length - 1;
  const lastSceneStart = sceneFrames[lastSceneIndex]?.from ?? 0;
  const endFade = interpolate(frame, [durationInFrames - 12, durationInFrames], [0, 0.6], {
    extrapolateLeft: 'clamp',
  });

  const musicVolume = (f: number) =>
    interpolate(f, [lastSceneStart, lastSceneStart + fps], [STYLE.musicVolume, STYLE.musicVolumeOutro], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <AbsoluteFill style={{backgroundColor: theme.bg}}>
      {/* La voix vient de NOTRE mp3 (sync captions garantie) — l'avatar est mute. */}
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      {musicFile ? (
        <Audio src={staticFile(musicFile)} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
      ) : null}

      {/* Base : l'avatar qui parle, du debut a la fin. */}
      <OffthreadVideo
        src={staticFile(avatarVideo)}
        muted
        style={{width: '100%', height: '100%', objectFit: 'cover', filter: STYLE.grade}}
      />

      {/* Cutaways produit sur les scenes du milieu (jamais la 1re ni la derniere). */}
      {scenes.map((scene, i) => {
        if (i === 0 || i === lastSceneIndex) return null;
        // Une scene sur deux reste sur l'avatar pour garder le cote humain.
        if (i % 2 === 0) return null;
        const {from, duration} = sceneFrames[i];
        return (
          <Sequence key={`cut-${i}`} from={from} durationInFrames={duration}>
            <Cutaway
              src={images[scene.imageIndex] ?? images[0]}
              videoSrc={brollClips?.[scene.imageIndex]}
              duration={duration}
              gradient={theme.gradient}
            />
          </Sequence>
        );
      })}

      {/* Bloc prix + urgence sur la derniere scene, par-dessus l'avatar. */}
      {sceneFrames[lastSceneIndex] ? (
        <Sequence
          from={sceneFrames[lastSceneIndex].from}
          durationInFrames={sceneFrames[lastSceneIndex].duration + fps}
        >
          <Audio src={staticFile('sfx/pop.mp3')} volume={STYLE.sfxPopVolume} />
          <PriceBlock price={price} compareAtPrice={compareAtPrice} />
          <UrgencyBanner />
        </Sequence>
      ) : null}

      <Karaoke timings={timings} emphasis={emphasis} textColor={STYLE.captionColor} />

      <Vignette />
      <Watermark brand={brand} color={theme.watermark} />

      <AbsoluteFill style={{backgroundColor: '#000', opacity: endFade, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
