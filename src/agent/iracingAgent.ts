import { IRacingSDK, type SessionData, type TelemetryVarList } from 'irsdk-node';
import type { IracingCarFrame, IracingFrame, IracingRelayRecord, IracingTimingLine } from '../utils/iracingRelay.js';
import { createIracingRelayRecords } from '../utils/iracingRelay.js';

export interface IracingAgentConfig {
  baseUrl: string;
  password: string;
  pollIntervalMs: number;
  sessionId: string;
  sourceId: string;
  timingLines: IracingTimingLine[];
  username: string;
}

export interface IracingAgentApi {
  login: (request: { password: string; username: string }) => Promise<void>;
  sendRecords: (sourceId: string, sessionId: string, records: IracingRelayRecord[]) => Promise<void>;
}

export interface IracingSdk {
  getSessionData: () => SessionData | null;
  getTelemetry: () => TelemetryVarList;
  startSDK: () => boolean;
  stopSDK: () => void;
  waitForData: (timeout?: number) => boolean;
}

const numericValue = (variable: { value: number[] | boolean[] }): number => {
  const value: number | boolean | undefined = variable.value[0];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const numericArray = (variable: { value: number[] | boolean[] }): number[] =>
  variable.value.map((value: number | boolean): number => typeof value === 'number' && Number.isFinite(value) ? value : 0);

const booleanArray = (variable: { value: number[] | boolean[] }): boolean[] =>
  variable.value.map((value: number | boolean): boolean => value === true || value === 1);

export const createIracingFrame = (telemetry: TelemetryVarList, sessionData: SessionData | null): IracingFrame | undefined => {
  const sessionUniqueId: number = numericValue(telemetry.SessionUniqueID);
  const sessionNumber: number = numericValue(telemetry.SessionNum);
  const sessionId: string = `${sessionUniqueId}:${sessionNumber}`;
  const driverByCarIndex = new Map<number, number>(
    (sessionData?.DriverInfo.Drivers || [])
      .filter((driver): boolean => Number.isFinite(driver.CarIdx) && Number.isFinite(driver.UserID) && driver.UserID > 0)
      .map((driver): [number, number] => [driver.CarIdx, driver.UserID]),
  );
  const lapDistance = numericArray(telemetry.CarIdxLapDistPct);
  const laps = numericArray(telemetry.CarIdxLap);
  const onPitRoad = booleanArray(telemetry.CarIdxOnPitRoad);
  const cars: IracingCarFrame[] = lapDistance.flatMap((lapDistancePercent: number, carIndex: number): IracingCarFrame[] => {
    const customerId: number | undefined = driverByCarIndex.get(carIndex);
    if (customerId === undefined || lapDistancePercent < 0 || lapDistancePercent > 1) {
      return [];
    }
    return [{
      customerId,
      lapDistancePercent,
      lapNumber: laps[carIndex] || 0,
      onPitRoad: onPitRoad[carIndex] || false,
    }];
  });
  return cars.length > 0 ? { cars, sessionId, sessionTimeSeconds: numericValue(telemetry.SessionTime) } : undefined;
};

export const runIracingAgent = async (
  config: IracingAgentConfig,
  api: IracingAgentApi,
  sdk: IracingSdk = new IRacingSDK({ autoEnableTelemetry: true }),
  signal?: AbortSignal,
): Promise<void> => {
  const started: boolean = sdk.startSDK();
  if (!started) {
    throw new Error('The iRacing SDK could not be started. Is iRacing running with telemetry enabled?');
  }
  await api.login({ password: config.password, username: config.username });
  let previous: IracingFrame | undefined;
  let pending: IracingRelayRecord[] = [];
  try {
    while (!signal?.aborted) {
      if (sdk.waitForData(config.pollIntervalMs)) {
        const frame: IracingFrame | undefined = createIracingFrame(sdk.getTelemetry(), sdk.getSessionData());
        if (frame) {
          pending = [...pending, ...createIracingRelayRecords(previous, frame, config.timingLines)];
          previous = frame;
        }
      }
      if (pending.length > 0) {
        try {
          await api.sendRecords(config.sourceId, config.sessionId, pending.slice(0, 100));
          pending = pending.slice(100);
        } catch (error: unknown) {
          console.warn(`RaceSweet iRacing upload failed; retaining ${pending.length} record(s): ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } finally {
    sdk.stopSDK();
  }
};
