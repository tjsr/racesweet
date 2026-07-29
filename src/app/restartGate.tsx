import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { RestartRequiredDialog } from '../views/display/restartRequiredDialog.js';
import { RESTART_REQUIRED_AFTER, requiresApplicationRestart } from './restartVersion.js';

interface LaunchVersionResponse {
  launchedVersion: string;
}

interface RestartGateProps {
  children: ReactNode;
  getLaunchedVersion?: () => Promise<string>;
  requiredVersion?: string;
}

type RestartGateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { error: string; status: 'restart-required' }
  | { launchedVersion: string; status: 'restart-required' };

export const getLaunchedApplicationVersion = async (): Promise<string> => {
  const response: Response = await fetch('/api/v1/runtime-version', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to read the application launch version (${response.status}).`);
  }

  const payload: Partial<LaunchVersionResponse> = await response.json() as Partial<LaunchVersionResponse>;
  if (typeof payload.launchedVersion !== 'string') {
    throw new Error('The application launch version response is invalid.');
  }

  return payload.launchedVersion;
};

export const RestartGate = (props: RestartGateProps): ReactElement => {
  const [state, setState] = useState<RestartGateState>({ status: 'checking' });
  const requiredVersion: string = props.requiredVersion || RESTART_REQUIRED_AFTER;
  const getLaunchedVersion: () => Promise<string> = props.getLaunchedVersion || getLaunchedApplicationVersion;

  useEffect((): (() => void) => {
    let active: boolean = true;

    getLaunchedVersion()
      .then((launchedVersion: string): void => {
        if (!active) {
          return;
        }
        setState(requiresApplicationRestart(launchedVersion, requiredVersion)
          ? { launchedVersion, status: 'restart-required' }
          : { status: 'ready' });
      })
      .catch((error: Error): void => {
        if (active) {
          setState({
            error: error.message,
            status: 'restart-required',
          });
        }
      });

    return (): void => {
      active = false;
    };
  }, [getLaunchedVersion, requiredVersion]);

  if (state.status === 'ready') {
    return <>{props.children}</>;
  }

  return (
    <>
      {props.children}
      <RestartRequiredDialog
        checking={state.status === 'checking'}
        error={'error' in state ? state.error : undefined}
        launchedVersion={'launchedVersion' in state ? state.launchedVersion : undefined}
        requiredVersion={requiredVersion}
      />
    </>
  );
};
