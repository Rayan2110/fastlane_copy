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

const FONT =
  '"Segoe UI Black", "Segoe UI", "Arial Black", system-ui, sans-serif';

type SceneProps = {
  src: string;
  from: number;
  duration: number;
  zoomFrom?: number;
  zoomTo?: number;
};

const KenBurnsImage: React.FC<SceneProps> = ({
  src,
  duration,
  zoomFrom = 1,
  zoomTo = 1.12,
}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, duration], [zoomFrom, zoomTo], {
    extrapolateRight: 'clamp',
  });
  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{opacity: fadeIn, backgroundColor: '#0b0b14'}}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${zoom})`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to top, rgba(5,5,15,0.85) 0%, rgba(5,5,15,0.25) 35%, rgba(5,5,15,0) 60%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{
  lines: {text: string; accent?: boolean}[];
}> = ({lines}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 380,
        paddingLeft: 70,
        paddingRight: 70,
      }}
    >
      <div style={{textAlign: 'center'}}>
        {lines.map((line, i) => {
          const s = spring({
            frame: frame - i * 5,
            fps,
            config: {damping: 14, stiffness: 160},
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: line.accent ? 88 : 72,
                lineHeight: 1.15,
                color: line.accent ? '#ffc447' : '#ffffff',
                textShadow: '0 6px 30px rgba(0,0,0,0.75)',
                transform: `translateY(${(1 - s) * 60}px) scale(${0.9 + s * 0.1})`,
                opacity: s,
                textTransform: 'uppercase',
                letterSpacing: '-0.5px',
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const PriceBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 8, fps, config: {damping: 11}});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          transform: `scale(${s}) rotate(-4deg)`,
          backgroundColor: '#ffc447',
          borderRadius: 40,
          padding: '40px 70px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 46,
            color: '#3a2c00',
            textDecoration: 'line-through',
            opacity: 0.6,
          }}
        >
          59,90 €
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 120,
            color: '#1a1400',
            lineHeight: 1,
          }}
        >
          39,90 €
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Watermark: React.FC = () => (
  <AbsoluteFill
    style={{
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 120,
    }}
  >
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: 40,
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: '10px',
        textShadow: '0 4px 20px rgba(0,0,0,0.6)',
      }}
    >
      SILÈNE
    </div>
  </AbsoluteFill>
);

export const SileneDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#0b0b14'}}>
      <Audio src={staticFile('voice.mp3')} />

      <Sequence from={0} durationInFrames={96}>
        <KenBurnsImage src="hero-sunrise.jpg" from={0} duration={96} />
        <Caption
          lines={[
            {text: 'Réveillé en sursaut'},
            {text: 'chaque matin ?', accent: true},
          ]}
        />
      </Sequence>

      <Sequence from={96} durationInFrames={108}>
        <KenBurnsImage
          src="product-angle.jpg"
          from={96}
          duration={108}
          zoomFrom={1.12}
          zoomTo={1}
        />
        <Caption
          lines={[
            {text: 'Une vibration douce'},
            {text: 'au poignet', accent: true},
          ]}
        />
      </Sequence>

      <Sequence from={204} durationInFrames={132}>
        <KenBurnsImage src="pink-night.jpg" from={204} duration={132} />
        <Caption
          lines={[
            {text: 'Zéro bruit.'},
            {text: 'Personne d’autre', accent: true},
            {text: 'ne se réveille'},
          ]}
        />
      </Sequence>

      <Sequence from={336} durationInFrames={78}>
        <KenBurnsImage
          src="colors-lineup.jpg"
          from={336}
          duration={78}
          zoomFrom={1.1}
          zoomTo={1}
        />
        <Caption
          lines={[
            {text: '5 coloris', accent: true},
            {text: '10 jours d’autonomie'},
          ]}
        />
      </Sequence>

      <Sequence from={414} durationInFrames={156}>
        <KenBurnsImage src="nightstand.jpg" from={414} duration={156} />
        <PriceBadge />
        <Caption lines={[{text: 'Lien en bio', accent: true}]} />
      </Sequence>

      <Watermark />
    </AbsoluteFill>
  );
};
