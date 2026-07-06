import React from 'react';
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

export const FastestTimeIndicatorsPanel = (props: FastestTimeIndicatorsPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Fastest time indicators</h2>
    <div className="event-details-form-grid">
      {indicatorFields.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            aria-label={field.label}
            onChange={(event) => {
              void props.onSaveFastestTimeIndicatorColors({ [field.key]: event.target.value });
            }}
            type="color"
            value={props.colors[field.key]}
          />
        </label>
      ))}
    </div>
  </section>
);
