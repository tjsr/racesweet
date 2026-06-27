import React from 'react';

interface LogPanelProps {
  displayedErrorLog?: string;
}

export const LogPanel = (props: LogPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Log</h2>
    <label>
      Error Log
      <textarea
        aria-label="Application Error Log"
        readOnly
        value={props.displayedErrorLog || ''}
      />
    </label>
  </section>
);
