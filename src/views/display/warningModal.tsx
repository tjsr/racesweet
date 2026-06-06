import React from 'react';

export interface WarningModalAction {
  label: string;
  onClick: () => void;
}

interface WarningModalProps {
  actions: WarningModalAction[];
  ariaLabel: string;
  message: string;
  title: string;
}

export const WarningModal = (props: WarningModalProps): React.ReactElement => (
  <div className="warning-modal-backdrop">
    <section className="warning-modal error" role="dialog" aria-modal="true" aria-label={props.ariaLabel}>
      <div className="warning-modal-heading">
        <span className="warning-icon" aria-hidden="true">!</span>
        <h2>{props.title}</h2>
      </div>
      <p>{props.message}</p>
      <div className="events-actions warning-modal-actions">
        {props.actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  </div>
);
