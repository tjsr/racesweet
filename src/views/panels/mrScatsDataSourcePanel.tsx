import React from 'react';
import type { DataSourceConfig } from '../../app/systemConfig.js';
import type { MrScatsDataFileInventory, MrScatsDataFileSummary } from '../../parsers/mrScats/fileInventory.js';
import type { MrScatsDataFilePreview, MrScatsPreviewValue } from '../../parsers/mrScats/filePreview.js';

interface MrScatsDataSourcePanelProps {
  onLoadEvent?: (sourceId: string) => void | Promise<void>;
  onPreviewDataFile?: (sourceId: string, file: MrScatsDataFileSummary) => Promise<MrScatsDataFilePreview>;
  onSaveSource: (sourceId: string, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectDataArchive?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectDataDirectory?: () => Promise<MrScatsDataFileInventory | undefined>;
  source: DataSourceConfig;
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

export const MrScatsDataSourcePanel = (props: MrScatsDataSourcePanelProps): React.ReactElement => {
  const config = props.source.mrScatsConfig || { files: [] };
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
        dataLocationPath: selectedInventory.locationPath,
        files: selectedInventory.files,
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

  return (
    <>
      <h4>MR-SCATS Data</h4>
      <label>
        Data files location
        <input
          aria-label={`MR-SCATS Data Files Location ${props.source.id}`}
          readOnly
          type="text"
          value={config.dataLocationPath || ''}
          placeholder="No file or directory selected"
        />
      </label>
      <div className="events-actions">
        <button type="button" onClick={handleSelectDataDirectory} disabled={!props.onSelectDataDirectory}>
          Select Directory
        </button>
        <button type="button" onClick={handleSelectDataArchive} disabled={!props.onSelectDataArchive}>
          Select Archive
        </button>
        <button type="button" onClick={() => props.onLoadEvent?.(props.source.id)} disabled={!config.dataLocationPath}>
          Load event
        </button>
      </div>
      <p>{formatFileCount(inventory)}</p>
      {config.files.length > 0 ? (
        <table aria-label={`MR-SCATS Data Files ${props.source.id}`}>
          <thead>
            <tr>
              <th>File</th>
              <th>Kind</th>
              <th>Size</th>
              <th>Records</th>
            </tr>
          </thead>
          <tbody>
            {config.files.map((file) => (
              <tr key={file.relativePath}>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      void handlePreviewFile(file);
                    }}
                    disabled={!props.onPreviewDataFile}
                  >
                    {file.relativePath}
                  </button>
                </td>
                <td>{file.kind}</td>
                <td>{file.size}</td>
                <td>{file.dbf?.recordCount ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {preview || previewError || previewLoadingFile ? (
        <div className="warning-modal-backdrop">
          <section className="warning-modal reload-summary-dialog mr-scats-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="mr-scats-preview-title">
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
                            <td key={column}>{formatPreviewValue(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>
            <div className="events-actions warning-modal-actions">
              <button type="button" onClick={closePreview}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
