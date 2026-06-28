import React from 'react';
import type { SessionSourceReloadSummary, SessionSourceReloadSummaryCounts } from '../../app/sessionSourceReload.js';

interface ReloadSummaryDialogProps {
  onClose: () => void;
  summary: SessionSourceReloadSummary;
}

const SUMMARY_ROWS: Array<{ key: keyof SessionSourceReloadSummary; label: string }> = [
  { key: 'categories', label: 'Categories' },
  { key: 'participants', label: 'Participants' },
  { key: 'teams', label: 'Teams' },
  { key: 'flags', label: 'Flag records' },
  { key: 'crossings', label: 'Crossings' },
];

const formatCount = (counts: SessionSourceReloadSummaryCounts, key: keyof SessionSourceReloadSummaryCounts): string => {
  return counts[key].toString();
};

export const ReloadSummaryDialog = (props: ReloadSummaryDialogProps): React.ReactElement => (
  <div className="warning-modal-backdrop">
    <section className="warning-modal reload-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="reload-summary-title">
      <div className="warning-modal-heading">
        <h2 id="reload-summary-title">Data Reloaded</h2>
      </div>
      <table className="reload-summary-table" aria-label="Reload summary">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Created</th>
            <th scope="col">Deleted</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {SUMMARY_ROWS.map((row) => {
            const counts = props.summary[row.key];
            return (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{formatCount(counts, 'created')}</td>
                <td>{formatCount(counts, 'deleted')}</td>
                <td>{formatCount(counts, 'updated')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="events-actions warning-modal-actions">
        <button type="button" onClick={props.onClose}>Close</button>
      </div>
    </section>
  </div>
);
