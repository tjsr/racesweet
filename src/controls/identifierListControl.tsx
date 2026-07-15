import React from 'react';
import { getParticipantIdentifiers } from '../controllers/participant.js';
import { type EventParticipant, type ParticipantTransponder } from '../model/eventparticipant.js';
import { getParticipantDisplayName } from '../model/participantDisplay.js';

type IdentifierType = 'racePlate' | 'txNo';
type IdentifierUpdateValues = string[] | ParticipantTransponder[];

interface IdentifierDraftRow {
  assignmentTime: string;
  value: string;
}

interface IdentifierListControlProps {
  addButtonLabel: string;
  allowMultiple: boolean;
  heading: string;
  identifierType: IdentifierType;
  onUpdateIdentifiers: (participantId: string, values: IdentifierUpdateValues) => void | Promise<void>;
  participants: EventParticipant[];
  removeButtonLabel: string;
  rowLabel: string;
  normalizeValue: (value: string) => string;
  showAssignmentTime?: boolean;
}

const getParticipantLabel = (participant: EventParticipant): string => {
  return getParticipantDisplayName(participant);
};

const getInitialDraftRows = (
  participants: EventParticipant[],
  identifierType: IdentifierType
): Record<string, IdentifierDraftRow[]> => Object.fromEntries(participants.map((participant) => {
  const participantId = participant.id.toString();
  const values = participant.identifiers
    .filter((identifier) => Object.prototype.hasOwnProperty.call(identifier, identifierType))
    .map((identifier) => {
      const identifierRecord = identifier as unknown as Record<string, string | number | Date | undefined>;
      const identifierValue = identifierRecord[identifierType];
      return {
        assignmentTime: formatDateTimeLocal(identifier.fromTime),
        value: identifierValue?.toString() || '',
      };
    });
  return [participantId, values.length > 0 ? values : [{ assignmentTime: '', value: '' }]];
}));

const formatDateTimeLocal = (value: Date | undefined): string => {
  if (!value) {
    return '';
  }

  const offsetMilliseconds = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
};

const parseDateTimeLocal = (value: string): Date | undefined => value.length > 0 ? new Date(value) : undefined;

const normalizeRows = (
  rows: IdentifierDraftRow[],
  identifierType: IdentifierType,
  normalizeValue: (value: string) => string,
  showAssignmentTime: boolean
): IdentifierUpdateValues => {
  const normalizedValues: Array<string | ParticipantTransponder> = [];
  const seenValues = new Set<string>();

  for (const row of rows) {
    const normalizedValue = normalizeValue(row.value);
    const assignmentTime = showAssignmentTime ? parseDateTimeLocal(row.assignmentTime) : undefined;
    const seenKey = `${normalizedValue}|${assignmentTime?.toISOString() || ''}`;
    if (normalizedValue.length === 0 || seenValues.has(seenKey)) {
      continue;
    }

    seenValues.add(seenKey);
    if (identifierType === 'txNo') {
      normalizedValues.push({
        fromTime: assignmentTime,
        toTime: undefined,
        txNo: /^\d+$/.test(normalizedValue) ? Number(normalizedValue) : normalizedValue,
      });
      continue;
    }

    normalizedValues.push(normalizedValue);
  }

  return identifierType === 'txNo' ? normalizedValues as ParticipantTransponder[] : normalizedValues as string[];
};

const areEqual = (left: IdentifierUpdateValues, right: IdentifierUpdateValues): boolean => JSON.stringify(left) === JSON.stringify(right);

const getSavedRows = (participants: EventParticipant[], identifierType: IdentifierType): Record<string, IdentifierUpdateValues> => Object.fromEntries(participants.map((participant) => [
  participant.id.toString(),
  identifierType === 'txNo'
    ? participant.identifiers
      .filter((identifier) => Object.prototype.hasOwnProperty.call(identifier, identifierType))
      .map((identifier) => {
        const identifierRecord = identifier as unknown as Record<string, string | number | undefined>;
        return {
          fromTime: identifier.fromTime,
          toTime: identifier.toTime,
          txNo: identifierRecord.txNo || '',
        };
      })
    : getParticipantIdentifiers(participant, identifierType).map((identifier) => identifier.toString()),
]));

export const IdentifierListControl = (props: IdentifierListControlProps): React.ReactElement => {
  const [draftRows, setDraftRows] = React.useState<Record<string, IdentifierDraftRow[]>>(
    () => getInitialDraftRows(props.participants, props.identifierType)
  );
  const [savedRows, setSavedRows] = React.useState<Record<string, IdentifierUpdateValues>>(
    () => getSavedRows(props.participants, props.identifierType)
  );

  React.useEffect(() => {
    setDraftRows(getInitialDraftRows(props.participants, props.identifierType));
    setSavedRows(getSavedRows(props.participants, props.identifierType));
  }, [props.identifierType, props.participants]);

  const commitParticipant = (participantId: string, rows: IdentifierDraftRow[]): void => {
    const nextValues = normalizeRows(rows, props.identifierType, props.normalizeValue, props.showAssignmentTime === true);
    const currentValues = savedRows[participantId] || [];

    if (areEqual(nextValues, currentValues)) {
      setDraftRows((current) => ({
        ...current,
        [participantId]: rows.length > 0 ? rows : [{ assignmentTime: '', value: '' }],
      }));
      return;
    }

    props.onUpdateIdentifiers(participantId, nextValues);
    setSavedRows((current) => ({
      ...current,
      [participantId]: nextValues,
    }));
    setDraftRows((current) => ({
      ...current,
      [participantId]: rows.length > 0 ? rows : [{ assignmentTime: '', value: '' }],
    }));
  };

  const updateRow = (participantId: string, rowIndex: number, changes: Partial<IdentifierDraftRow>): void => {
    setDraftRows((current) => {
      const currentRows = current[participantId] || [{ assignmentTime: '', value: '' }];
      const nextRows = [...currentRows];
      nextRows[rowIndex] = {
        ...(nextRows[rowIndex] || { assignmentTime: '', value: '' }),
        ...changes,
      };
      return {
        ...current,
        [participantId]: nextRows,
      };
    });
  };

  const addRow = (participantId: string): void => {
    setDraftRows((current) => {
      const currentRows = current[participantId] || [{ assignmentTime: '', value: '' }];
      return {
        ...current,
        [participantId]: [...currentRows, { assignmentTime: '', value: '' }],
      };
    });
  };

  const removeRow = (participantId: string, rowIndex: number): void => {
    const currentRows = draftRows[participantId] || [{ assignmentTime: '', value: '' }];
    const nextRows = currentRows.filter((_, index) => index !== rowIndex);
    commitParticipant(participantId, nextRows.length > 0 ? nextRows : [{ assignmentTime: '', value: '' }]);
  };

  return (
    <section className="readonly-summary-section">
      <h3>{props.heading}</h3>
      {props.participants.length === 0 ? (
        <p className="readonly-summary">No participant is selected.</p>
      ) : props.participants.map((participant) => {
        const participantId = participant.id.toString();
        const participantLabel = getParticipantLabel(participant);
        const rows = draftRows[participantId] || [{ assignmentTime: '', value: '' }];

        return (
          <div className="identification-editor identifier-list-participant" key={participantId}>
            <div className="identifier-list-participant-header">
              {participantLabel}
            </div>
            <div className="identifier-list-rows">
              {rows.map((rowValue, rowIndex) => (
                <div className="identifier-list-row" key={`${participantId}-${rowIndex}`}>
                  <label className="identifier-list-input-wrapper">
                    <span className="identifier-list-row-label">{`${props.rowLabel} ${rowIndex + 1}`}</span>
                    <input
                      aria-label={`${props.rowLabel} ${participantLabel} ${rowIndex + 1}`}
                      className="identifier-list-input"
                      type="text"
                      value={rowValue.value}
                      onBlur={() => commitParticipant(participantId, rows)}
                      onChange={(event) => updateRow(participantId, rowIndex, { value: event.target.value })}
                    />
                  </label>
                  {props.showAssignmentTime ? (
                    <label className="identifier-list-input-wrapper">
                      <span className="identifier-list-row-label">Assignment time</span>
                      <input
                        aria-label={`Assignment time ${participantLabel} ${rowIndex + 1}`}
                        className="identifier-list-input"
                        type="datetime-local"
                        value={rowValue.assignmentTime}
                        onBlur={() => commitParticipant(participantId, rows)}
                        onChange={(event) => updateRow(participantId, rowIndex, { assignmentTime: event.target.value })}
                      />
                    </label>
                  ) : null}
                  <button
                    aria-label={`${props.removeButtonLabel} ${rowIndex + 1} for ${participantLabel}`}
                    className="identifier-list-remove-button"
                    disabled={!props.allowMultiple}
                    type="button"
                    onClick={() => removeRow(participantId, rowIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              className="identifier-list-add-button"
              disabled={!props.allowMultiple && rows.length >= 1}
              type="button"
              onClick={() => addRow(participantId)}
            >
              {props.addButtonLabel}
            </button>
          </div>
        );
      })}
    </section>
  );
};
