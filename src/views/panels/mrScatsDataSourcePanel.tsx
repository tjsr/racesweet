import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Button, Checkbox, FormControlLabel, TextField } from '@mui/material';
import type { DataSourceConfig } from '../../app/systemConfig.js';
import type { MrScatsDataFileInventory, MrScatsDataFileSummary } from '../../parsers/mrScats/fileInventory.js';
import type { MrScatsDataFilePreview, MrScatsPreviewValue } from '../../parsers/mrScats/filePreview.js';
import type { InlineLoadingProgress } from './InlineLoadingIndicator.js';
import { ResponsiveDataList, type ResponsiveDataRow, ResponsiveDialog } from '../admin/adminPrimitives.js';
import { FileSelectionField } from './fileSelectionField.js';

interface MrScatsDataSourcePanelProps {
  onLoadEvent?: (sourceId: string, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onPreviewDataFile?: (sourceId: string, file: MrScatsDataFileSummary) => Promise<MrScatsDataFilePreview>;
  onSaveSource: (sourceId: string, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectDataArchive?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectDataDirectory?: () => Promise<MrScatsDataFileInventory | undefined>;
  source: DataSourceConfig;
}

interface MrScatsFileGroup {
  files: MrScatsDataFileSummary[];
  key: string;
  label: string;
}

const formatFileCount = (inventory: MrScatsDataFileInventory | undefined): string => {
  if (!inventory) {
    return 'No data files loaded.';
  }

  return `${inventory.files.length} file${inventory.files.length === 1 ? '' : 's'} loaded from ${inventory.sourceKind}.`;
};

const formatPreviewValue = (value: MrScatsPreviewValue): string => {
  if (value === undefined) {
    return '';
  }
  return String(value);
};

const isCalculatedPreviewCell = (preview: MrScatsDataFilePreview, rowIndex: number, column: string): boolean => {
  return (preview.calculatedCells || []).some((cell) => cell.rowIndex === rowIndex && cell.column === column);
};

const parseFinishLineNumbers = (value: string): number[] => {
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const formatSessionNumber = (sessionNumber: number): string => {
  return sessionNumber.toString().padStart(2, '0');
};

const getMrScatsSessionGroupKey = (file: MrScatsDataFileSummary): string | undefined => {
  if (!file.meetingCode || !file.sessionCode || file.sessionNumber === undefined) {
    return undefined;
  }

  return `${file.meetingCode}-${file.sessionCode}-${formatSessionNumber(file.sessionNumber)}`;
};

const getMrScatsSessionGroupLabel = (file: MrScatsDataFileSummary): string | undefined => {
  if (!file.meetingCode || !file.sessionCode || file.sessionNumber === undefined) {
    return undefined;
  }

  return `${file.meetingCode} ${file.sessionCode}${formatSessionNumber(file.sessionNumber)}`;
};

const groupMrScatsFiles = (files: MrScatsDataFileSummary[]): {
  generalFiles: MrScatsDataFileSummary[];
  sessionGroups: MrScatsFileGroup[];
} => {
  const generalFiles: MrScatsDataFileSummary[] = [];
  const sessionGroupsByKey = new Map<string, MrScatsFileGroup>();

  files.forEach((file) => {
    const sessionGroupKey = getMrScatsSessionGroupKey(file);
    const sessionGroupLabel = getMrScatsSessionGroupLabel(file);

    if (!sessionGroupKey || !sessionGroupLabel) {
      generalFiles.push(file);
      return;
    }

    const existingGroup = sessionGroupsByKey.get(sessionGroupKey);
    if (existingGroup) {
      existingGroup.files.push(file);
      return;
    }

    sessionGroupsByKey.set(sessionGroupKey, {
      files: [file],
      key: sessionGroupKey,
      label: sessionGroupLabel,
    });
  });

  const sessionGroups = Array.from(sessionGroupsByKey.values()).sort((left, right) => left.label.localeCompare(right.label));

  return {
    generalFiles,
    sessionGroups,
  };
};

export const MrScatsDataSourcePanel = (props: MrScatsDataSourcePanelProps): React.ReactElement => {
  const config = props.source.mrScatsConfig || { files: [] };
  const finishLineNumbersValue = (props.source.finishLineNumbers || [1]).join(', ');
  const ignoreLineOneNo1CrossingsWhenDbfPresent = config.ignoreLineOneNo1CrossingsWhenDbfPresent !== false;
  const [preview, setPreview] = React.useState<MrScatsDataFilePreview | undefined>();
  const [previewError, setPreviewError] = React.useState<string | undefined>();
  const [previewLoadingFile, setPreviewLoadingFile] = React.useState<string | undefined>();
  const inventory: MrScatsDataFileInventory | undefined = config.dataLocationPath ? {
    files: config.files,
    locationPath: config.dataLocationPath,
    sourceKind: config.sourceKind || 'directory',
  } : undefined;

  const saveSelectedInventory = async (selectedInventory: MrScatsDataFileInventory | undefined): Promise<void> => {
    if (!selectedInventory) {
      return;
    }

    await props.onSaveSource(props.source.id, {
      mrScatsConfig: {
        ...config,
        dataLocationPath: selectedInventory.locationPath,
        files: selectedInventory.files,
        ignoreLineOneNo1CrossingsWhenDbfPresent,
        sourceKind: selectedInventory.sourceKind,
      },
    });
  };

  const handleSelectDataArchive = async (): Promise<void> => {
    await saveSelectedInventory(await props.onSelectDataArchive?.());
  };

  const handleSelectDataDirectory = async (): Promise<void> => {
    await saveSelectedInventory(await props.onSelectDataDirectory?.());
  };

  const handlePreviewFile = async (file: MrScatsDataFileSummary): Promise<void> => {
    if (!props.onPreviewDataFile) {
      return;
    }

    setPreview(undefined);
    setPreviewError(undefined);
    setPreviewLoadingFile(file.relativePath);
    try {
      setPreview(await props.onPreviewDataFile(props.source.id, file));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoadingFile(undefined);
    }
  };

  const closePreview = (): void => {
    setPreview(undefined);
    setPreviewError(undefined);
    setPreviewLoadingFile(undefined);
  };

  const previewTitle = preview?.fileName || previewLoadingFile || 'MR-SCATS file preview';
  const { generalFiles, sessionGroups } = groupMrScatsFiles(config.files);

  const renderFileTable = (files: MrScatsDataFileSummary[], ariaLabel: string): React.ReactElement =>
    <ResponsiveDataList label={ariaLabel} rows={files.map((file: MrScatsDataFileSummary): ResponsiveDataRow => ({
      cells: [
        { label: 'File', value: <Button disabled={!props.onPreviewDataFile} onClick={(): void => {
          void handlePreviewFile(file);
        }}
        sx={{ minHeight: 48, overflowWrap: 'anywhere' }}>{file.relativePath}</Button> },
        { label: 'Kind', value: file.kind }, { label: 'Size', value: file.size }, { label: 'Records', value: file.dbf?.recordCount ?? '-' },
      ], id: file.relativePath,
    }))} />;

  return (
    <>
      <h4>MR-SCATS Data</h4>
      <FileSelectionField
        actions={[
          { disabled: !props.onSelectDataDirectory, label: 'Select Directory', onClick: handleSelectDataDirectory },
          { disabled: !props.onSelectDataArchive, label: 'Select Archive', onClick: handleSelectDataArchive },
        ]}
        ariaLabel={`MR-SCATS Data Files Location ${props.source.id}`}
        label="Data files location"
        placeholder="No file or directory selected"
        value={config.dataLocationPath || ''}
      />
      <TextField label="Finish line numbers"
        slotProps={{ htmlInput: { 'aria-label': `MR-SCATS Finish Line Numbers ${props.source.id}`, inputMode: 'numeric' } }}
        defaultValue={finishLineNumbersValue}
        onBlur={(event) => {
          void props.onSaveSource(props.source.id, {
            finishLineNumbers: parseFinishLineNumbers(event.target.value),
          });
        }}
        type="text"
      />
      <FormControlLabel control={<Checkbox
        slotProps={{ input: { 'aria-label': `MR-SCATS Ignore Line 1 NO1 Crossings ${props.source.id}` } }}
        checked={ignoreLineOneNo1CrossingsWhenDbfPresent}
        onChange={(event) => {
          void props.onSaveSource(props.source.id, {
            mrScatsConfig: {
              ...config,
              ignoreLineOneNo1CrossingsWhenDbfPresent: event.target.checked,
            },
          });
        }}
      />} label="ignore Line 1 from NO1 files if DBF file is present" />
      <div className="events-actions">
      </div>
      <p>{formatFileCount(inventory)}</p>
      {config.files.length > 0 ? (
        <div className="mr-scats-file-groups">
          <Accordion defaultExpanded>
            <AccordionSummary>General ({generalFiles.length})</AccordionSummary>
            <AccordionDetails>
              {generalFiles.length > 0
                ? renderFileTable(generalFiles, `MR-SCATS General Data Files ${props.source.id}`)
                : <p>No general data files found.</p>}
            </AccordionDetails>
          </Accordion>
          {sessionGroups.map((group) => (
            <Accordion key={group.key}>
              <AccordionSummary>{group.label} ({group.files.length})</AccordionSummary>
              <AccordionDetails>
                {renderFileTable(group.files, `MR-SCATS Session Data Files ${group.label} ${props.source.id}`)}
              </AccordionDetails>
            </Accordion>
          ))}
        </div>
      ) : null}
      {preview || previewError || previewLoadingFile ? (
        <ResponsiveDialog open disablePortal aria-labelledby="mr-scats-preview-title" fullWidth maxWidth="xl"
          slotProps={{ paper: { className: 'mr-scats-preview-dialog' } }}>
          <section className="warning-modal reload-summary-dialog mr-scats-preview-dialog">
            <div className="warning-modal-heading">
              <h2 id="mr-scats-preview-title">{previewTitle}</h2>
            </div>
            <div className="mr-scats-preview-content">
              {previewLoadingFile ? (
                <p>Loading preview...</p>
              ) : null}
              {previewError ? (
                <div className="inline-error" role="alert">
                  <pre>{previewError}</pre>
                </div>
              ) : null}
              {preview ? (
                <>
                  <p>
                    {preview.parser.toUpperCase()} preview: {preview.displayedRowCount}
                    {preview.recordCount === undefined ? ' rows' : ` of ${preview.recordCount} records`}
                  </p>
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  <table aria-label={`MR-SCATS File Preview ${preview.fileName}`}>
                    <thead>
                      <tr>
                        {preview.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={`${preview.fileName}-${rowIndex}`}>
                          {preview.columns.map((column) => (
                            <td className={isCalculatedPreviewCell(preview, rowIndex, column) ? 'mr-scats-preview-calculated-cell' : undefined} key={column}>
                              {formatPreviewValue(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>
            <div className="events-actions warning-modal-actions">
              <Button onClick={closePreview}>Close</Button>
            </div>
          </section>
        </ResponsiveDialog>
      ) : null}
    </>
  );
};
