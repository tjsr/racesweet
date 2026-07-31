import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import React, { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AuthenticatedUser,
  AuthenticationStatus,
  LoginRequest,
} from "../model/serverApi.js";
import { HttpRaceSweetApiClient } from "../service/raceSweetApiClient.js";
import { RaceSweetMainApp } from "./App.js";
import {
  clearSavedLoginCredentials,
  loadSavedLoginCredentials,
  saveLoginCredentials,
} from "./savedLoginCredentials.js";
import { formatErrorForDisplay } from "./stackTrace.js";

interface CredentialsFormProps {
  error?: string;
  onSubmit: (credentials: LoginRequest) => Promise<boolean>;
  setupRequired: boolean;
}

interface StartupConnectionFailureProps {
  endpoint: string;
  error: string;
  onRetry: () => void;
}

export const StartupConnectionFailure = ({
  endpoint,
  error,
  onRetry,
}: StartupConnectionFailureProps): React.ReactElement => (
  <Box component="main" sx={{ margin: "10vh auto", maxWidth: 680, padding: 3 }}>
    <Alert severity="error">
      <AlertTitle>Unable to connect to the RaceSweet server</AlertTitle>
      <Stack spacing={2}>
        <Typography>
          RaceSweet could not retrieve the initial authentication status. The
          application has not attempted to sign you in or modify any race data.
        </Typography>
        <Box
          component="pre"
          sx={{
            backgroundColor: "action.hover",
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            margin: 0,
            overflowWrap: "anywhere",
            padding: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {`Request: GET ${endpoint}\nError: ${error}`}
        </Box>
        <Typography variant="body2">
          Check that the RaceSweet server is running, then retry. If this is the
          Electron application, close and reopen it if retrying does not restore
          the connection.
        </Typography>
        <Box>
          <Button onClick={onRetry} variant="contained">
            Retry connection
          </Button>
        </Box>
      </Stack>
    </Alert>
  </Box>
);

export const CredentialsForm = ({
  error,
  onSubmit,
  setupRequired,
}: CredentialsFormProps): React.ReactElement => {
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [saveCredentials, setSaveCredentials] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect((): (() => void) => {
    let active: boolean = true;
    loadSavedLoginCredentials().then(
      (savedCredentials: LoginRequest | undefined): void => {
        if (!active || !savedCredentials) {
          return;
        }
        setPassword(savedCredentials.password);
        setUsername(savedCredentials.username);
        setSaveCredentials(true);
      },
    );
    return (): void => {
      active = false;
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmitting(true);
    onSubmit({ password, username })
      .then(async (authenticationSucceeded: boolean): Promise<void> => {
        if (authenticationSucceeded && !setupRequired) {
          if (saveCredentials) {
            await saveLoginCredentials({ password, username });
          } else {
            await clearSavedLoginCredentials();
          }
        }
      })
      .finally((): void => setSubmitting(false));
  };

  return (
    <Box
      component="main"
      sx={{ margin: "10vh auto", maxWidth: 440, padding: 3 }}
    >
      <Stack component="form" onSubmit={submit} spacing={2}>
        <Typography component="h1" variant="h4">
          RaceSweet
        </Typography>
        <Typography>
          {setupRequired
            ? "Create the first administrator account. Initial setup is only available from this computer."
            : "Sign in to access this RaceSweet server."}
        </Typography>
        {location.protocol === "http:" &&
        location.hostname !== "127.0.0.1" &&
        location.hostname !== "localhost" ? (
            <Alert severity="warning">
            This server is using unencrypted HTTP. Credentials and race data can
            be observed by other devices on the network.
            </Alert>
          ) : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField
          autoComplete="username"
          label="Username"
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            setUsername(event.target.value)
          }
          required
          value={username}
        />
        <TextField
          autoComplete={setupRequired ? "new-password" : "current-password"}
          helperText={setupRequired ? "Use at least 12 characters." : undefined}
          label="Password"
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            setPassword(event.target.value)
          }
          required
          type="password"
          value={password}
        />
        {!setupRequired ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={saveCredentials}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                  setSaveCredentials(event.target.checked)
                }
              />
            }
            label="Save credentials"
          />
        ) : null}
        <Button disabled={submitting} type="submit" variant="contained">
          {setupRequired ? "Create administrator" : "Sign in"}
        </Button>
      </Stack>
    </Box>
  );
};

export const AuthenticatedRaceSweetApp = (): React.ReactElement => {
  const client: HttpRaceSweetApiClient = useMemo(
    (): HttpRaceSweetApiClient => new HttpRaceSweetApiClient(),
    [],
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [connectionAttempt, setConnectionAttempt] = useState<number>(0);
  const [connectionError, setConnectionError] = useState<string | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<AuthenticationStatus | undefined>(
    undefined,
  );
  const authenticationStatusEndpoint: string = `${globalThis.location?.origin || ""}/api/v1/auth/status`;

  useEffect((): (() => void) => {
    let active: boolean = true;
    client
      .status()
      .then((nextStatus: AuthenticationStatus): void => {
        if (active) {
          setConnectionError(undefined);
          setStatus(nextStatus);
        }
      })
      .catch((loadError: unknown): void => {
        if (active) {
          setConnectionError(formatErrorForDisplay(loadError));
        }
      });
    return (): void => {
      active = false;
    };
  }, [client, connectionAttempt]);

  if (status?.user) {
    return <RaceSweetMainApp />;
  }
  if (!status && !connectionError) {
    return (
      <Box sx={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
        <CircularProgress aria-label="Connecting to RaceSweet server" />
      </Box>
    );
  }
  if (!status && connectionError) {
    const retryConnection = (): void => {
      setConnectionError(undefined);
      setConnectionAttempt((attempt: number): number => attempt + 1);
    };
    return (
      <StartupConnectionFailure
        endpoint={authenticationStatusEndpoint}
        error={connectionError}
        onRetry={retryConnection}
      />
    );
  }

  const authenticate = async (credentials: LoginRequest): Promise<boolean> => {
    setError(undefined);
    try {
      const user: AuthenticatedUser = status?.setupRequired
        ? await client.setup(credentials)
        : await client.login(credentials);
      setStatus({
        setupRequired: false,
        user,
      });
      return true;
    } catch (authenticationError: unknown) {
      setError(formatErrorForDisplay(authenticationError));
      return false;
    }
  };

  return (
    <CredentialsForm
      error={error}
      onSubmit={authenticate}
      setupRequired={status?.setupRequired === true}
    />
  );
};
