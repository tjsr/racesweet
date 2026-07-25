import React from 'react';
import { Button } from '@mui/material';
import { type FastestTimeIndicatorColors } from '../../app/systemConfig.js';

interface FastestTimeIndicatorsPanelProps {
  colors: FastestTimeIndicatorColors;
  onSaveFastestTimeIndicatorColors: (changes: Partial<FastestTimeIndicatorColors>) => void | Promise<void>;
}

interface FastestTimeIndicatorField {
  key: keyof FastestTimeIndicatorColors;
  label: string;
}

const indicatorFields: FastestTimeIndicatorField[] = [
  { key: 'sessionFastestTime', label: 'Session fastest time' },
  { key: 'entrantFastestTime', label: 'Entrant fastest time' },
  { key: 'entrantFasterTime', label: 'Entrant faster time' },
];

const getContrastTextColor = (backgroundColor: string): string => {
  const normalizedColor = backgroundColor.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return '#ffffff';
  }

  const red = Number.parseInt(normalizedColor.slice(0, 2), 16);
  const green = Number.parseInt(normalizedColor.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedColor.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 150 ? '#111111' : '#ffffff';
};

export const FastestTimeIndicatorsPanel = (props: FastestTimeIndicatorsPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Fastest time indicators</h2>
    <div className="event-details-form-grid">
      {indicatorFields.map((field) => (
        <Button
          component="label"
          disableElevation
          key={field.key}
          style={{
            backgroundColor: props.colors[field.key],
            color: getContrastTextColor(props.colors[field.key]),
          }}
          variant="contained"
        >
          {field.label}
          <input
            aria-label={field.label}
            className="fastest-time-indicator-color-input"
            onChange={(event) => {
              void props.onSaveFastestTimeIndicatorColors({ [field.key]: event.target.value });
            }}
            type="color"
            value={props.colors[field.key]}
          />
        </Button>
      ))}
    </div>
  </section>
);
