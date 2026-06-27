import React from 'react';

interface LocalStorageLocationPanelProps {
  localStorageDirectoryPath: string;
  onSaveLocalStorageDirectoryPath: (directoryPath: string) => void | Promise<void>;
}

const LocalStorageDirectoryInput = (props: LocalStorageLocationPanelProps): React.ReactElement => {
  const [draft, setDraft] = React.useState(props.localStorageDirectoryPath);

  React.useEffect(() => {
    setDraft(props.localStorageDirectoryPath);
  }, [props.localStorageDirectoryPath]);

  const commit = (): void => {
    if (draft !== props.localStorageDirectoryPath) {
      void props.onSaveLocalStorageDirectoryPath(draft);
    }
  };

  return (
    <input
      aria-label="Local Storage Directory"
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      type="text"
      value={draft}
    />
  );
};

export const LocalStorageLocationPanel = (props: LocalStorageLocationPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Local storage location</h2>
    <label>
      Storage Directory
      <LocalStorageDirectoryInput
        localStorageDirectoryPath={props.localStorageDirectoryPath}
        onSaveLocalStorageDirectoryPath={props.onSaveLocalStorageDirectoryPath}
      />
    </label>
  </section>
);
