import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {Scene, WordTiming} from '../lib/types';
import {computeTimeline} from '../lib/timeline';

export type SlideshowProps = {
  images: string[]; // chemins relatifs a public/
  scenes: Scene[];
  timings: WordTiming[];
  price: string;
  compareAtPrice?: string;
  brand: string;
  audioFile: string; // relatif a public/
  musicFile?: string;
  styleVariant: 'dark' | 'light';
};

const FONT = '"Segoe UI Black", "Segoe UI", "Arial Black", system-ui, sans-serif';
const ACCENT = '#ffc447';
const WORDS_PER_GROUP = 4;

const THEMES = {
  dark: {
    bg: '#0b0b14',
    gradient:
      'linear-gradient(to top, rgba(5,5,15,0.85) 0%, rgba(5,5,15,0.25) 35%, rgba(5,5,15,0) 60%)',
    text: '#ffffff',
    watermark: 'rgba(255,255,255,0.85)',
  },
  light: {
    bg: '#f5f2ec',
    gradient:
      'linear-gradient(to top, rgba(30,25,15,0.75) 0%, rgba(30,25,15,0.2) 35%, rgba(30,25,15,0) 60%)',
    text: '#ffffff',
    watermark: 'rgba(255,255,255,0.9)',
  },
} as const;

const KenBurns: React.FC<{src: string; duration: number; zoomIn: boolean; bg: string; gradient: string}> = ({
  src,
  duration,
  zoomIn,
  bg,
  gradient,
}) => {
  const frame = useCurrentFrame();
  const [zFrom, zTo] = zoomIn ? [1, 1.13] : [1.13, 1];
  const zoom = interpolate(frame, [0, duration], [zFrom, zTo], {
    extrapolateRight: 'clamp',
  });
  const fadeIn = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: fadeIn, backgroundColor: bg}}>
      <Img
        src={staticFile(src)}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}}
      />
      <AbsoluteFill style={{background: gradient}} />
    </AbsoluteFill>
  );
};

// Sous-titres karaoke : groupe de mots courant, mot actif en accent.
const Karaoke: React.FC<{timings: WordTiming[]; textColor: string}> = ({timings, textColor}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const currentIndex = timings.findIndex((t) => nowMs >= t.startMs && nowMs < t.endMs);
  const lastStarted = timings.filter((t) => t.startMs <= nowMs).length - 1;
  const active = currentIndex >= 0 ? currentIndex : lastStarted;
  if (active < 0) return null;

  const groupStart = Math.floor(active / WORDS_PER_GROUP) * WORDS_PER_GROUP;
  const group = timings.slice(groupStart, groupStart + WORDS_PER_GROUP);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 300,
        paddingLeft: 60,
        paddingRight: 60,
      }}
    >
      <div style={{textAlign: 'center', lineHeight: 1.2}}>
        {group.map((t, i) => {
          const isActive = groupStart + i === active;
          return (
            <span
              key={groupStart + i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 64,
                textTransform: 'uppercase',
                color: isActive ? ACCENT : textColor,
                display: 'inline-block',
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                textShadow: '0 5px 25px rgba(0,0,0,0.8)',
                margin: '0 14px',
              }}
            >
              {t.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ScreenText: React.FC<{text: string}> = ({text}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 14, stiffness: 160}});
  return (
    <AbsoluteFill
      style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: 260, paddingLeft: 70, paddingRight: 70}}
    >
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 84,
          lineHeight: 1.12,
          textAlign: 'center',
          color: '#ffffff',
          textTransform: 'uppercase',
          textShadow: '0 6px 30px rgba(0,0,0,0.75)',
          transform: `translateY(${(1 - s) * 50}px)`,
          opacity: s,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const PriceBadge: React.FC<{price: string; compareAtPrice?: string}> = ({price, compareAtPrice}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 6, fps, config: {damping: 11}});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          transform: `scale(${s}) rotate(-4deg)`,
          backgroundColor: ACCENT,
          borderRadius: 36,
          padding: '36px 64px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          textAlign: 'center',
        }}
      >
        {compareAtPrice ? (
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 42,
              color: '#3a2c00',
              textDecoration: 'line-through',
              opacity: 0.6,
            }}
          >
            {compareAtPrice}
          </div>
        ) : null}
        <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 108, color: '#1a1400', lineHeight: 1}}>
          {price}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const slideshowCalculateMetadata = ({props}: {props: SlideshowProps}) => {
  const {totalFrames} = computeTimeline(props.scenes, props.timings, 30);
  return {durationInFrames: Math.max(totalFrames, 90), fps: 30};
};

export const Slideshow: React.FC<SlideshowProps> = ({
  images,
  scenes,
  timings,
  price,
  compareAtPrice,
  brand,
  audioFile,
  musicFile,
  styleVariant,
}) => {
  const {fps} = useVideoConfig();
  const theme = THEMES[styleVariant] ?? THEMES.dark;
  const {sceneFrames} = computeTimeline(scenes, timings, fps);

  return (
    <AbsoluteFill style={{backgroundColor: theme.bg}}>
      <Audio src={staticFile(audioFile)} />
      {musicFile ? <Audio src={staticFile(musicFile)} volume={0.12} loop /> : null}

      {scenes.map((scene, i) => {
        const {from, duration} = sceneFrames[i];
        const isLast = i === scenes.length - 1;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <KenBurns
              src={images[scene.imageIndex] ?? images[0]}
              duration={duration}
              zoomIn={i % 2 === 0}
              bg={theme.bg}
              gradient={theme.gradient}
            />
            {isLast ? (
              <PriceBadge price={price} compareAtPrice={compareAtPrice} />
            ) : (
              <ScreenText text={scene.screenText} />
            )}
          </Sequence>
        );
      })}

      <Karaoke timings={timings} textColor={theme.text} />

      <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: 100}}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 38,
            color: theme.watermark,
            letterSpacing: '10px',
            textTransform: 'uppercase',
            textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          {brand}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
