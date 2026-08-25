import React from 'react';
import {Composition} from 'remotion';
import {Slideshow, slideshowCalculateMetadata, type SlideshowProps} from './Slideshow';

const defaultProps: SlideshowProps = {
  images: [],
  scenes: [
    {imageIndex: 0, screenText: 'Aperçu', voiceText: 'Ceci est un aperçu du template.'},
    {imageIndex: 0, screenText: 'Fastlane Local', voiceText: 'Généré entièrement en local.'},
  ],
  timings: [
    {word: 'Ceci', startMs: 0, endMs: 400},
    {word: 'est', startMs: 400, endMs: 700},
    {word: 'un', startMs: 700, endMs: 900},
    {word: 'aperçu', startMs: 900, endMs: 1500},
    {word: 'du', startMs: 1500, endMs: 1700},
    {word: 'template.', startMs: 1700, endMs: 2400},
    {word: 'Généré', startMs: 2500, endMs: 3000},
    {word: 'entièrement', startMs: 3000, endMs: 3700},
    {word: 'en', startMs: 3700, endMs: 3900},
    {word: 'local.', startMs: 3900, endMs: 4500},
  ],
  price: '39,90 €',
  compareAtPrice: '59,90 €',
  brand: 'FASTLANE',
  audioFile: 'preview-silence.mp3',
  styleVariant: 'dark',
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="Slideshow"
      component={Slideshow}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={slideshowCalculateMetadata}
    />
  );
};
