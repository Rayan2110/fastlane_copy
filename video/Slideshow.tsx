import React, {useMemo} from 'react';
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
  Easing,
} from 'remotion';
import {loadFont} from '@remotion/google-fonts/ArchivoBlack';
import {Animated, Scale, Fade} from 'remotion-animated';
import type {Scene, WordTiming} from '../lib/types';
import {computeTimeline, computeShots} from '../lib/timeline';
import {STYLE, THEMES, EMPHASIS_PATTERN, EMPHASIS_KEYWORDS, type StyleVariant} from './style';

// Meme nettoyage partout : Set d'emphase et mots TTS doivent se comparer
// sous la meme forme (apostrophes et ponctuation retirees, minuscules).
const cleanWord = (w: string) => w.replace(/[.,!?;:«»"'’()]/g, '').toLowerCase();
import {WhiteFlash, Vignette, useCameraShake, useHookPunch} from './fx';

const {fontFamily: archivoBlack} = loadFont();
const FONT = `"${archivoBlack}", "Segoe UI Black", "Arial Black", system-ui, sans-serif`;

export type SlideshowProps = {
  images: string[]; // chemins relatifs a public/
  scenes: Scene[];
  timings: WordTiming[];
  price: string;
  compareAtPrice?: string;
  brand: string;
  audioFile: string; // relatif a public/
  musicFile?: string;
  beatFrames?: number[]; // coupes calees sur la musique
  styleVariant: StyleVariant;
};

// ---------- Plans (images) ----------

const ShotImage: React.FC<{
  src: string;
  duration: number;
  zoomIn: boolean;
  seed: number;
  bg: string;
  gradient: string;
}> = ({src, duration, zoomIn, seed, bg, gradient}) => {
  const frame = useCurrentFrame();
  const [zFrom, zTo] = zoomIn ? [1, 1 + STYLE.zoomStrength] : [1 + STYLE.zoomStrength, 1];
  const zoom = interpolate(frame, [0, duration], [zFrom, zTo], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const shake = useCameraShake(seed);
  return (
    <AbsoluteFill style={{backgroundColor: bg}}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${zoom})${shake}`,
          filter: STYLE.grade,
        }}
      />
      <AbsoluteFill style={{background: gradient}} />
    </AbsoluteFill>
  );
};

// ---------- Captions karaoke ----------

const Karaoke: React.FC<{timings: WordTiming[]; emphasis: Set<string>; textColor: string}> = ({
  timings,
  emphasis,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const currentIndex = timings.findIndex((t) => nowMs >= t.startMs && nowMs < t.endMs);
  const lastStarted = timings.filter((t) => t.startMs <= nowMs).length - 1;
  const active = currentIndex >= 0 ? currentIndex : lastStarted;
  if (active < 0) return null;

  const groupStart = Math.floor(active / STYLE.wordsPerGroup) * STYLE.wordsPerGroup;
  const group = timings.slice(groupStart, groupStart + STYLE.wordsPerGroup);

  const isEmphasis = (word: string) => {
    const clean = cleanWord(word);
    return emphasis.has(clean) || EMPHASIS_PATTERN.test(word) || EMPHASIS_KEYWORDS.test(clean);
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: STYLE.captionBottom,
        paddingLeft: 50,
        paddingRight: 50,
      }}
    >
      <div style={{textAlign: 'center', lineHeight: 1.15}}>
        {group.map((t, i) => {
          const idx = groupStart + i;
          const started = t.startMs <= nowMs;
          const isActive = idx === active;
          const strong = isEmphasis(t.word);
          // Pop d'apparition de chaque mot, cale sur son timing reel.
          const wordFrame = frame - Math.round((t.startMs / 1000) * fps);
          const pop = started
            ? spring({frame: Math.max(0, wordFrame), fps, config: {damping: 12, stiffness: 260}})
            : 0;
          return (
            <span
              key={idx}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: strong ? STYLE.emphasisFontSize : STYLE.captionFontSize,
                textTransform: 'uppercase',
                color: strong ? STYLE.emphasisColor : textColor,
                display: 'inline-block',
                opacity: started ? 1 : 0,
                transform: `scale(${(0.6 + pop * 0.4) * (isActive ? 1.08 : 1)})`,
                margin: '0 12px',
                WebkitTextStroke: `${STYLE.captionStroke}px ${STYLE.captionStrokeColor}`,
                paintOrder: 'stroke fill',
                textShadow: '0 6px 24px rgba(0,0,0,0.55)',
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

// ---------- Textes ecran ----------

const ScreenText: React.FC<{text: string; emoji?: string; big?: boolean}> = ({text, emoji, big}) => (
  <AbsoluteFill
    style={{
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 300,
      paddingLeft: 60,
      paddingRight: 60,
    }}
  >
    <Animated animations={[Fade({to: 1, initial: 0}), Scale({by: 1, initial: 0.85})]}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: big ? STYLE.hookFontSize : STYLE.screenTextFontSize,
          lineHeight: 1.1,
          textAlign: 'center',
          color: '#ffffff',
          textTransform: 'uppercase',
          WebkitTextStroke: `${STYLE.captionStroke}px ${STYLE.captionStrokeColor}`,
          paintOrder: 'stroke fill',
          textShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {emoji ? `${emoji} ` : ''}
        {text}
      </div>
    </Animated>
  </AbsoluteFill>
);

// ---------- Prix, urgence, CTA ----------

// Gere les formats europeens avec separateur de milliers : "1.299,00 €",
// "1 299,00 €", "39,90 €", "39.90". Le dernier . ou , n'est une decimale
// que s'il est suivi de 1-2 chiffres. Tolere null/undefined (produit sans prix).
function parsePrice(p: string | null | undefined): number {
  if (!p) return 0;
  const digits = p.replace(/[^\d,.]/g, '');
  const lastSep = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
  const decimals = lastSep >= 0 ? digits.length - lastSep - 1 : 0;
  const isDecimal = lastSep >= 0 && decimals >= 1 && decimals <= 2;
  const intPart = (isDecimal ? digits.slice(0, lastSep) : digits).replace(/[^\d]/g, '');
  const decPart = isDecimal ? digits.slice(lastSep + 1) : '';
  const n = Number(decPart ? `${intPart}.${decPart}` : intPart);
  return Number.isFinite(n) ? n : 0;
}

const PriceBlock: React.FC<{price: string; compareAtPrice?: string; cta?: string}> = ({
  price,
  compareAtPrice,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // Produit sans prix (page non-produit, extraction incomplete) : pas de badge.
  if (!price || !price.trim()) return null;
  const badgeIn = spring({frame: frame - 4, fps, config: {damping: 11}});
  // La barre rouge se dessine sur l'ancien prix.
  const strike = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const rawDiscount =
    compareAtPrice && parsePrice(compareAtPrice) > 0
      ? Math.round((1 - parsePrice(price) / parsePrice(compareAtPrice)) * 100)
      : 0;
  // Garde-fou : un badge "-100%" ou negatif serait pire que pas de badge.
  const discount = rawDiscount > 0 && rawDiscount < 95 ? rawDiscount : 0;
  const discountIn = spring({frame: frame - 16, fps, config: {damping: 9, stiffness: 220}});
  const pulse = 1 + 0.03 * Math.sin(frame * STYLE.ctaPulseSpeed * Math.PI);

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          transform: `scale(${badgeIn}) rotate(${STYLE.priceBadgeRotation}deg)`,
          backgroundColor: STYLE.accent,
          borderRadius: 36,
          padding: '38px 64px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {compareAtPrice ? (
          <div style={{position: 'relative', display: 'inline-block'}}>
            <span
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 44,
                color: STYLE.accentDark,
                opacity: 0.55,
              }}
            >
              {compareAtPrice}
            </span>
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: '52%',
                width: `${strike * 100}%`,
                height: 6,
                backgroundColor: '#d7263d',
                borderRadius: 3,
                transform: 'rotate(-6deg)',
              }}
            />
          </div>
        ) : null}
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 112,
            color: STYLE.accentDark,
            lineHeight: 1,
            transform: `scale(${pulse})`,
          }}
        >
          {price}
        </div>
        {discount > 0 ? (
          <div
            style={{
              position: 'absolute',
              top: -28,
              right: -34,
              transform: `scale(${discountIn}) rotate(8deg)`,
              backgroundColor: '#d7263d',
              color: '#ffffff',
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 40,
              borderRadius: 999,
              padding: '14px 22px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }}
          >
            -{discount}%
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const UrgencyBanner: React.FC = () => {
  const frame = useCurrentFrame();
  if (!STYLE.urgencyBanner) return null;
  const pulse = 0.85 + 0.15 * Math.abs(Math.sin(frame * STYLE.ctaPulseSpeed));
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 220}}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 42,
          color: '#ffffff',
          backgroundColor: '#d7263d',
          borderRadius: 14,
          padding: '14px 30px',
          textTransform: 'uppercase',
          opacity: pulse,
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        }}
      >
        ⬇ Lien en bio ⬇
      </div>
    </AbsoluteFill>
  );
};

// ---------- Metadata ----------

export const slideshowCalculateMetadata = ({props}: {props: SlideshowProps}) => {
  const {totalFrames} = computeTimeline(props.scenes, props.timings, 30);
  return {durationInFrames: Math.max(totalFrames, 90), fps: 30};
};

// ---------- Composition ----------

export const Slideshow: React.FC<SlideshowProps> = ({
  images,
  scenes,
  timings,
  price,
  compareAtPrice,
  brand,
  audioFile,
  musicFile,
  beatFrames,
  styleVariant,
}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const theme = THEMES[styleVariant] ?? THEMES.dark;
  const {sceneFrames} = useMemo(() => computeTimeline(scenes, timings, fps), [scenes, timings, fps]);
  const shots = useMemo(
    () =>
      computeShots(scenes, sceneFrames, images.length, {
        maxShotFrames: STYLE.maxShotFrames,
        minShotFrames: STYLE.minShotFrames,
        beatFrames,
      }),
    [scenes, sceneFrames, images.length, beatFrames]
  );
  const emphasis = useMemo(() => {
    const set = new Set<string>();
    for (const s of scenes) {
      for (const w of s.emphasisWords ?? []) set.add(cleanWord(w));
    }
    return set;
  }, [scenes]);

  const punch = useHookPunch();
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
      {audioFile ? <Audio src={staticFile(audioFile)} /> : null}
      {musicFile ? (
        <Audio
          src={staticFile(musicFile)}
          volume={musicVolume}
          loop
          loopVolumeCurveBehavior="extend"
        />
      ) : null}

      {/* Couche images : plans courts, punch-in global d'ouverture */}
      <AbsoluteFill style={{transform: `scale(${punch})`}}>
        {shots.map((shot, i) => {
          // Le dernier plan tient jusqu'au bout du padding final.
          const extend = i === shots.length - 1 ? fps : 0;
          const src = images[shot.imageIndex] ?? images[0];
          if (!src) return null; // aucune image (preview Studio) : fond nu
          return (
            <Sequence key={`shot-${i}`} from={shot.from} durationInFrames={shot.duration + extend}>
              <ShotImage
                src={src}
                duration={shot.duration + extend}
                zoomIn={i % 2 === 0}
                seed={i}
                bg={theme.bg}
                gradient={theme.gradient}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* Flash blanc + whoosh a chaque coupe (sauf frame 0) */}
      {shots.slice(1).map((shot, i) => (
        <Sequence key={`cut-${i}`} from={shot.from} durationInFrames={Math.max(STYLE.flashFrames, 8)}>
          {STYLE.flashFrames > 0 ? <WhiteFlash /> : null}
          <Audio src={staticFile('sfx/whoosh.mp3')} volume={STYLE.sfxWhooshVolume} />
        </Sequence>
      ))}

      {/* Textes par scene : hook geant, textes ecran, bloc prix final */}
      {scenes.map((scene, i) => {
        const {from, duration} = sceneFrames[i];
        const extend = i === lastSceneIndex ? fps : 0;
        return (
          <Sequence key={`scene-${i}`} from={from} durationInFrames={duration + extend}>
            {i === lastSceneIndex ? (
              <>
                <Audio src={staticFile('sfx/pop.mp3')} volume={STYLE.sfxPopVolume} />
                <PriceBlock price={price} compareAtPrice={compareAtPrice} />
                <UrgencyBanner />
              </>
            ) : (
              <ScreenText text={scene.screenText} emoji={scene.emoji} big={i === 0} />
            )}
          </Sequence>
        );
      })}

      <Karaoke timings={timings} emphasis={emphasis} textColor={STYLE.captionColor} />

      <Vignette />

      <AbsoluteFill
        style={{justifyContent: 'flex-start', alignItems: 'center', paddingTop: STYLE.watermarkTop}}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 36,
            color: theme.watermark,
            letterSpacing: '10px',
            textTransform: 'uppercase',
            textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          {brand}
        </div>
      </AbsoluteFill>

      {/* Fondu de fin discret */}
      <AbsoluteFill style={{backgroundColor: '#000', opacity: endFade, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
