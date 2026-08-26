// Effets visuels vendores dans le repo — libres a modifier.
// Inspires des patterns Onda / RemotionUI / template-tiktok officiel.
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Easing} from 'remotion';
import {noise2D} from '@remotion/noise';
import {STYLE} from './style';

// Flash blanc aux coupes (place au debut d'une Sequence de flashFrames).
export const WhiteFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, STYLE.flashFrames], [0.9, 0], {
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{backgroundColor: '#ffffff', opacity}} />;
};

// Vignette douce sur les bords.
export const Vignette: React.FC = () => {
  if (STYLE.vignette <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${STYLE.vignette}) 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

// Micro-shake camera organique (bruit de Perlin, pas un sinus mecanique).
export function useCameraShake(seed: number): string {
  const frame = useCurrentFrame();
  if (STYLE.shakeAmp <= 0) return '';
  const x = noise2D(`shake-x-${seed}`, frame * STYLE.shakeSpeed, 0) * STYLE.shakeAmp;
  const y = noise2D(`shake-y-${seed}`, 0, frame * STYLE.shakeSpeed) * STYLE.shakeAmp;
  return ` translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
}

// Punch-in d'ouverture : zoom brutal qui se pose (arrete le scroll).
export function useHookPunch(): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, STYLE.hookPunchFrames], [1.35, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}
