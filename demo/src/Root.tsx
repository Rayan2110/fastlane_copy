import React from 'react';
import {Composition} from 'remotion';
import {SileneDemo} from './Video';

export const Root: React.FC = () => {
  return (
    <Composition
      id="SileneDemo"
      component={SileneDemo}
      durationInFrames={570}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
