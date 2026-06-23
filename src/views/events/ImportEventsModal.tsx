import React, { useState } from 'react';
import type { ImportedEventData } from '../../controllers/apicalImport.ts';
import type { RaceEvent } from '../../model/raceevent.ts';
import { importAllApicalEvents } from '../../controllers/apicalImport.ts';

export type ImportType = 'all-apical' | 'individual-apical' | 'mr-scats' | 'raceview';

interface ImportOption {
  id: ImportType;
  label: string;
  available: boolean;
}

const IMPORT_OPTIONS: ImportOption[] = [
  { available: true,  id: 'all-apical',        label: 'All Apical events' },
  { available: false, id: 'individual-apical',  label: 'Individual Apical event' },
  { available: false, id: 'mr-scats',           label: 'MR-SCATS data' },
  { available: false, id: 'raceview',           label: 'RaceView Data' },
];

interface ImportEventsModalProps {
  existingEvents: RaceEvent[];
  onImportComplete: (imported: ImportedEventData[]) => void;
  onClose: () => void;
}

export const ImportEventsModal = ({ existingEvents, onImportComplete, onClose }: ImportEventsModalProps) => {
  const [selectedType, setSelectedType] = useState<ImportType>('all-apical');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleImport = async () => {
    setIsImporting(true);
    setError(undefined);
    try {
      const existingApicalIds = new Set(existingEvents.map((e) => e.apicalId));
      let imported: ImportedEventData[] = [];

      if (selectedType === 'all-apical') {
        imported = await importAllApicalEvents(existingApicalIds);
      }

      onImportComplete(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <div className="modal">
        <div className="modal-header">
          <h2 id="import-modal-title">Import Events</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          <fieldset className="import-options">
            <legend>Select import source</legend>
            {IMPORT_OPTIONS.map(({ id, label, available }) => (
              <label key={id} className={`import-option${!available ? ' disabled' : ''}`}>
                <input
                  type="radio"
                  name="importType"
                  value={id}
                  checked={selectedType === id}
                  disabled={!available || isImporting}
                  onChange={() => available && setSelectedType(id)}
                />
                {label}
                {!available && <span className="coming-soon"> (coming soon)</span>}
              </label>
            ))}
          </fieldset>
          {error ? (
            <div className="error-message" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => setError(undefined)}>
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isImporting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleImport} disabled={isImporting}>
            {isImporting ? 'Importing\u2026' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
