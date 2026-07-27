import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import React from "react";
import type {
  ListenerServerConfig,
  RemoteServerConfig,
} from "../../app/systemConfig.js";
import { NumericInput } from "../../controls/numericInput.js";

interface ServerConfigurationPanelProps {
  listenerServer: ListenerServerConfig | undefined;
  onSaveListenerServer: (
    changes: Partial<ListenerServerConfig>,
  ) => void | Promise<void>;
  onSaveRemoteServer: (
    changes: Partial<RemoteServerConfig>,
  ) => void | Promise<void>;
  onSelectCertificateFile?: () => Promise<string | undefined>;
  onSelectPrivateKeyFile?: () => Promise<string | undefined>;
  remoteServer: RemoteServerConfig | undefined;
}

const parseOptionalPort = (value: string): number | undefined => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
};

export const ServerConfigurationPanel = (
  props: ServerConfigurationPanelProps,
): React.ReactElement => {
  const [listenerDraft, setListenerDraft] =
    React.useState<ListenerServerConfig>({
      enabled: false,
      ...props.listenerServer,
    });
  const [remoteServerDraft, setRemoteServerDraft] = React.useState(
    props.remoteServer?.baseUrl || "",
  );

  React.useEffect(() => {
    setListenerDraft({ enabled: false, ...props.listenerServer });
  }, [props.listenerServer]);

  React.useEffect(() => {
    setRemoteServerDraft(props.remoteServer?.baseUrl || "");
  }, [props.remoteServer?.baseUrl]);

  const saveListenerField = <TKey extends keyof ListenerServerConfig>(
    key: TKey,
    value: ListenerServerConfig[TKey],
  ): void => {
    const changes: Partial<ListenerServerConfig> = { [key]: value };
    void props.onSaveListenerServer(changes);
  };

  const saveRemoteServer = (): void => {
    void props.onSaveRemoteServer({ baseUrl: remoteServerDraft || undefined });
  };

  const selectListenerFile = (
    key: 'certificatePath' | 'privateKeyPath',
    selectFile: (() => Promise<string | undefined>) | undefined,
  ): void => {
    if (!selectFile) {
      return;
    }

    void selectFile().then((filePath) => {
      if (!filePath) {
        return;
      }

      setListenerDraft((current) => ({ ...current, [key]: filePath }));
      saveListenerField(key, filePath);
    });
  };

  return (
    <section className="events-panel" aria-label="RaceSweet server">
      <h2>RaceSweet server</h2>
      <Stack spacing={2}>
        <FormControlLabel
          control={
            <Checkbox
              checked={listenerDraft.enabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                setListenerDraft((current) => ({ ...current, enabled }));
                saveListenerField("enabled", enabled);
              }}
            />
          }
          label="Enable listener server"
        />
        <Alert severity="info">
          Changes to listener ports or TLS files reload the active listener
          after validation succeeds.
        </Alert>
        <Stack direction={{ md: "row", xs: "column" }} spacing={2}>
          <NumericInput
            ariaLabel="HTTP listener port"
            label="HTTP port"
            onBlur={(value) =>
              saveListenerField("httpPort", parseOptionalPort(value))
            }
            onChange={(value) =>
              setListenerDraft((current) => ({
                ...current,
                httpPort: parseOptionalPort(value),
              }))
            }
            value={listenerDraft.httpPort || ""}
          />
          <NumericInput
            ariaLabel="HTTPS listener port"
            label="HTTPS port"
            onBlur={(value) =>
              saveListenerField("httpsPort", parseOptionalPort(value))
            }
            onChange={(value) =>
              setListenerDraft((current) => ({
                ...current,
                httpsPort: parseOptionalPort(value),
              }))
            }
            value={listenerDraft.httpsPort || ""}
          />
        </Stack>
        <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
          <TextField
            fullWidth
            label="SSL certificate file"
            slotProps={{ htmlInput: { 'aria-label': 'SSL certificate file', readOnly: true } }}
            value={listenerDraft.certificatePath || ''}
          />
          <Button
            disabled={!props.onSelectCertificateFile}
            type="button"
            onClick={() => selectListenerFile('certificatePath', props.onSelectCertificateFile)}
          >
            Select certificate
          </Button>
        </Stack>
        <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
          <TextField
            fullWidth
            label="SSL private key file"
            slotProps={{ htmlInput: { 'aria-label': 'SSL private key file', readOnly: true } }}
            value={listenerDraft.privateKeyPath || ''}
          />
          <Button
            disabled={!props.onSelectPrivateKeyFile}
            type="button"
            onClick={() => selectListenerFile('privateKeyPath', props.onSelectPrivateKeyFile)}
          >
            Select private key
          </Button>
        </Stack>
        <TextField
          fullWidth
          helperText="Optional. Local mutations are replicated to this compatible RaceSweet server."
          label="RaceSweet remote server"
          onBlur={saveRemoteServer}
          onChange={(event) => setRemoteServerDraft(event.target.value)}
          slotProps={{ htmlInput: { "aria-label": "RaceSweet remote server" } }}
          type="url"
          value={remoteServerDraft}
        />
      </Stack>
    </section>
  );
};
