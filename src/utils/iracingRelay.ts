export interface IracingCarFrame {
  customerId: number;
  lapDistancePercent: number;
  lapNumber: number;
  onPitRoad: boolean;
}

export interface IracingFrame {
  cars: IracingCarFrame[];
  sessionId: string;
  sessionTimeSeconds: number;
}

export interface IracingTimingLine {
  id: string;
  lapDistancePercent: number;
  kind: 'finish' | 'pit-entry' | 'pit-exit' | 'sector';
}

export interface IracingRelayRecord {
  customerId: number;
  id: string;
  kind: 'finish' | 'pit-entry' | 'pit-exit' | 'sector';
  lapNumber: number;
  lineId: string;
  sessionId: string;
  sessionTimeSeconds: number;
}

const crossedLine = (previous: number, next: number, line: number): boolean => (
  next >= previous ? line > previous && line <= next : line > previous || line <= next
);

const interpolateTime = (previous: IracingFrame, next: IracingFrame, previousProgress: number, nextProgress: number, line: number): number => {
  const distance = nextProgress >= previousProgress ? nextProgress - previousProgress : 1 - previousProgress + nextProgress;
  const lineDistance = line >= previousProgress ? line - previousProgress : 1 - previousProgress + line;
  return previous.sessionTimeSeconds + ((next.sessionTimeSeconds - previous.sessionTimeSeconds) * lineDistance / distance);
};

export const createIracingRelayRecords = (previous: IracingFrame | undefined, next: IracingFrame, lines: IracingTimingLine[]): IracingRelayRecord[] => {
  if (!previous || previous.sessionId !== next.sessionId) {
    return [];
  }
  const previousCars = new Map(previous.cars.map((car) => [car.customerId, car] as const));
  return next.cars.flatMap((car) => {
    const previousCar = previousCars.get(car.customerId);
    if (!previousCar) {
      return [];
    }
    const records: IracingRelayRecord[] = lines.flatMap((line) => {
      if (!crossedLine(previousCar.lapDistancePercent, car.lapDistancePercent, line.lapDistancePercent)) {
        return [];
      }
      const sessionTimeSeconds = interpolateTime(previous, next, previousCar.lapDistancePercent, car.lapDistancePercent, line.lapDistancePercent);
      const lapNumber = car.lapDistancePercent < previousCar.lapDistancePercent ? car.lapNumber : previousCar.lapNumber;
      return [{ customerId: car.customerId, id: `${next.sessionId}:${car.customerId}:${line.id}:${lapNumber}`, kind: line.kind, lapNumber, lineId: line.id, sessionId: next.sessionId, sessionTimeSeconds }];
    });
    if (previousCar.onPitRoad !== car.onPitRoad) {
      records.push({ customerId: car.customerId, id: `${next.sessionId}:${car.customerId}:${car.onPitRoad ? 'pit-entry' : 'pit-exit'}:${car.lapNumber}:${next.sessionTimeSeconds}`, kind: car.onPitRoad ? 'pit-entry' : 'pit-exit', lapNumber: car.lapNumber, lineId: car.onPitRoad ? 'pit-entry' : 'pit-exit', sessionId: next.sessionId, sessionTimeSeconds: next.sessionTimeSeconds });
    }
    return records;
  });
};
