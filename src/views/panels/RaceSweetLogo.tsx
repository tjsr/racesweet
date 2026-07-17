import React from 'react';
import raceSweetLogo from '../../../racesweet.svg';

interface RaceSweetLogoProps {
  className?: string;
}

export const RaceSweetLogo = ({ className }: RaceSweetLogoProps): React.ReactElement => (
  <img
    alt="RaceSweet"
    className={className}
    src={raceSweetLogo}
  />
);
