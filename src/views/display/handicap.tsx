import type { HandicapRiderSnapshot, HandicapRoundSnapshot, HandicapSnapshot } from '../../model/handicapSnapshot.js';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';

interface HandicapViewProps {
  participantNames?: string[];
  snapshotPath?: string;
}

interface RoundColumn {
  eventDate?: string;
  eventId: number;
  eventName?: string;
  eventNumber: number;
}

interface RiderProjection {
  expectedLapTimeSeconds: number;
  lapCount: number;
  projectedRaceTimeSeconds: number;
  roundedStartOffsetSeconds: number;
  startOffsetSeconds: number;
}

interface RoundExtremes {
  fastestRiderNames: Set<string>;
  slowestRiderNames: Set<string>;
}

const DEFAULT_HANDICAP_SNAPSHOT_PATH = '../../src/generated/handicapSnapshot.json';
const DEFAULT_START_OFFSET_INTERVAL = 15;
const START_OFFSET_INTERVAL_OPTIONS: number[] = [1, 5, 15, 30, 60];

const parseMmSs = (value: string): number | undefined => {
  const trimmed = value.trim();
  const match = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }

  return (minutes * 60) + seconds;
};

const formatSeconds = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatRoundedSeconds = (seconds: number): string => formatSeconds(Math.max(0, Math.round(seconds)));

const capitalize = (value: string): string =>
  value.length === 0 ? '' : value.charAt(0).toUpperCase() + value.slice(1);

const getLatestMedianLapTime = (rider: HandicapRiderSnapshot): number | undefined => {
  const latestRound = Object.values(rider.roundsByEventId)
    .filter((round: HandicapRoundSnapshot) => round.medianLapTime !== null)
    .sort((a, b) => b.eventNumber - a.eventNumber)[0];

  return latestRound?.medianLapTime ?? undefined;
};

const defaultLapTimeInput = (rider: HandicapRiderSnapshot | undefined): string => {
  if (!rider) {
    return '';
  }

  const latestMedian = getLatestMedianLapTime(rider);
  return latestMedian !== undefined ? formatRoundedSeconds(latestMedian) : '';
};

const projectedLapTimeInput = (seconds: number | undefined): string => {
  if (seconds === undefined) {
    return '';
  }

  return formatRoundedSeconds(seconds);
};

const roundToNearestInterval = (value: number, intervalSeconds: number): number => {
  if (intervalSeconds <= 0) {
    return Math.max(0, Math.round(value));
  }

  return Math.max(0, Math.round(value / intervalSeconds) * intervalSeconds);
};

const formatRoundCell = (round?: HandicapRoundSnapshot, bold: boolean = false): React.ReactNode => {
  if (!round) {
    return null;
  }
  const score = round.ratioScore !== null ? round.ratioScore.toFixed(4) : null;
  const time = round.medianLapTime !== null ? formatSeconds(round.medianLapTime) : null;
  const confidence = round.confidenceFactor !== null ? round.confidenceFactor.toFixed(3) : null;
  if (score === null && time === null && confidence === null) {
    return null;
  }

  const valueStyle = bold ? { fontWeight: 'bold' as const } : undefined;

  return (
    <>
      {score !== null && <div style={valueStyle}>{score}</div>}
      {time !== null && <div style={valueStyle}>{time}</div>}
      {confidence !== null && <div style={valueStyle}>{confidence}</div>}
    </>
  );
};

export const HandicapView = ({ participantNames, snapshotPath = DEFAULT_HANDICAP_SNAPSHOT_PATH }: HandicapViewProps) => {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<HandicapSnapshot | undefined>(undefined);
  const [raceDurationInput, setRaceDurationInput] = useState<string>('60:00');
  const [startOffsetIntervalSeconds, setStartOffsetIntervalSeconds] = useState<number>(DEFAULT_START_OFFSET_INTERVAL);
  const [fasterRiderName, setFasterRiderName] = useState<string>('');
  const [fasterRiderLapTimeInput, setFasterRiderLapTimeInput] = useState<string>('');
  const [slowerRiderName, setSlowerRiderName] = useState<string>('');
  const [slowerRiderLapTimeInput, setSlowerRiderLapTimeInput] = useState<string>('');

  useEffect(() => {
    const loadSnapshot = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setError(undefined);

        if (!window.api?.requestFileContent) {
          throw new Error('window.api.requestFileContent is not available in renderer context.');
        }

        const rawSnapshot = await window.api.requestFileContent<string>(snapshotPath, 'utf8');
        const parsedSnapshot = JSON.parse(rawSnapshot) as HandicapSnapshot;
        setSnapshot(parsedSnapshot);
      } catch (loadError: unknown) {
        const errMessage = loadError instanceof Error ? loadError.message : String(loadError);
        setError(`Could not load handicap snapshot from ${snapshotPath}: ${errMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadSnapshot().catch((unhandledError: unknown) => {
      const errMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
      setError(`Unexpected load error: ${errMessage}`);
      setIsLoading(false);
    });
  }, [snapshotPath]);

  const riders = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const sorted = [...snapshot.riders].sort((a: HandicapRiderSnapshot, b: HandicapRiderSnapshot) => a.handicapRatio - b.handicapRatio);
    if (!participantNames || participantNames.length === 0) {
      return sorted;
    }
    const normalizedNames = new Set(participantNames.map((n) => n.trim().toLowerCase()));
    return sorted.filter((rider: HandicapRiderSnapshot) => normalizedNames.has(rider.name.trim().toLowerCase()));
  }, [participantNames, snapshot]);

  useEffect(() => {
    if (riders.length < 2) {
      return;
    }

    const defaultFaster = riders[0];
    const defaultSlower = riders[riders.length - 1];

    if (!fasterRiderName) {
      setFasterRiderName(defaultFaster.name);
      setFasterRiderLapTimeInput(defaultLapTimeInput(defaultFaster));
    }

    if (!slowerRiderName) {
      setSlowerRiderName(defaultSlower.name);
      setSlowerRiderLapTimeInput(defaultLapTimeInput(defaultSlower));
    }
  }, [fasterRiderName, riders, slowerRiderName]);

  const riderByName = useMemo(() => {
    const map = new Map<string, HandicapRiderSnapshot>();
    riders.forEach((rider: HandicapRiderSnapshot) => {
      map.set(rider.name, rider);
    });
    return map;
  }, [riders]);

  const fasterRider = fasterRiderName ? riderByName.get(fasterRiderName) : undefined;
  const slowerRider = slowerRiderName ? riderByName.get(slowerRiderName) : undefined;

  useEffect(() => {
    if (!fasterRider || !slowerRider) {
      return;
    }

    if (fasterRider.handicapRatio < slowerRider.handicapRatio) {
      return;
    }

    const nextSlower = riders.find((candidate: HandicapRiderSnapshot) => candidate.handicapRatio > fasterRider.handicapRatio);
    setSlowerRiderName(nextSlower?.name ?? '');
    if (nextSlower) {
      setSlowerRiderLapTimeInput(getProjectedLapInputForRider(nextSlower.name) ?? defaultLapTimeInput(nextSlower));
    } else {
      setSlowerRiderLapTimeInput('');
    }
  }, [fasterRider, riders, slowerRider]);

  const selectableFasterRiders = useMemo(() => {
    if (!slowerRider) {
      return riders;
    }
    return riders.filter((rider: HandicapRiderSnapshot) => rider.handicapRatio < slowerRider.handicapRatio || rider.name === fasterRiderName);
  }, [fasterRiderName, riders, slowerRider]);

  const selectableSlowerRiders = useMemo(() => {
    if (!fasterRider) {
      return riders;
    }
    return riders.filter((rider: HandicapRiderSnapshot) => rider.handicapRatio > fasterRider.handicapRatio || rider.name === slowerRiderName);
  }, [fasterRider, riders, slowerRiderName]);

  const projectionError = useMemo(() => {
    const raceDurationSeconds = parseMmSs(raceDurationInput);
    if (raceDurationSeconds === undefined || raceDurationSeconds <= 0) {
      return 'Race duration must be entered as MM:SS.';
    }

    if (!fasterRider || !slowerRider) {
      return 'Select both faster and slower riders.';
    }

    if (fasterRider.handicapRatio >= slowerRider.handicapRatio) {
      return 'The faster rider must have a lower handicap ratio than the slower rider.';
    }

    const fasterSeconds = parseMmSs(fasterRiderLapTimeInput);
    const slowerSeconds = parseMmSs(slowerRiderLapTimeInput);
    if (fasterSeconds === undefined || slowerSeconds === undefined) {
      return 'Rider lap times must be entered as MM:SS.';
    }

    if (slowerSeconds <= fasterSeconds) {
      return 'The slower rider lap time must be greater than the faster rider lap time.';
    }

    return undefined;
  }, [fasterRider, fasterRiderLapTimeInput, raceDurationInput, slowerRider, slowerRiderLapTimeInput]);

  const riderProjections = useMemo(() => {
    const raceDurationSeconds = parseMmSs(raceDurationInput);
    const fasterSeconds = parseMmSs(fasterRiderLapTimeInput);
    const slowerSeconds = parseMmSs(slowerRiderLapTimeInput);

    if (
      projectionError ||
      raceDurationSeconds === undefined ||
      fasterSeconds === undefined ||
      slowerSeconds === undefined ||
      !fasterRider ||
      !slowerRider
    ) {
      return new Map<string, RiderProjection>();
    }

    const ratioRange = slowerRider.handicapRatio - fasterRider.handicapRatio;
    const timeRange = slowerSeconds - fasterSeconds;

    if (ratioRange <= 0) {
      return new Map<string, RiderProjection>();
    }

    const expectedLapTimes = new Map<string, number>();
    riders.forEach((rider: HandicapRiderSnapshot) => {
      const ratioPosition = (rider.handicapRatio - fasterRider.handicapRatio) / ratioRange;
      const expectedLapTime = fasterSeconds + (ratioPosition * timeRange);
      expectedLapTimes.set(rider.name, Math.max(1, expectedLapTime));
    });

    const categoryLapCounts = new Map<string, number>();
    const categories = new Set(riders.map((rider: HandicapRiderSnapshot) => rider.category));

    categories.forEach((category: string) => {
      const categoryRiders = riders.filter((rider: HandicapRiderSnapshot) => rider.category === category);
      const categoryFastestLap = Math.min(
        ...categoryRiders.map((rider: HandicapRiderSnapshot) => expectedLapTimes.get(rider.name) ?? Number.POSITIVE_INFINITY)
      );

      if (!Number.isFinite(categoryFastestLap) || categoryFastestLap <= 0) {
        categoryLapCounts.set(category, 1);
        return;
      }

      const targetLapCount = Math.max(1, Math.round(raceDurationSeconds / categoryFastestLap));
      categoryLapCounts.set(category, targetLapCount);
    });

    const categorySlowestProjected = new Map<string, number>();
    riders.forEach((rider: HandicapRiderSnapshot) => {
      const expectedLap = expectedLapTimes.get(rider.name);
      if (expectedLap === undefined) {
        return;
      }

      const lapCount = categoryLapCounts.get(rider.category) ?? 1;
      const projectedRaceTime = expectedLap * lapCount;
      const existingSlowest = categorySlowestProjected.get(rider.category) ?? 0;
      if (projectedRaceTime > existingSlowest) {
        categorySlowestProjected.set(rider.category, projectedRaceTime);
      }
    });

    const projections = new Map<string, RiderProjection>();
    riders.forEach((rider: HandicapRiderSnapshot) => {
      const expectedLap = expectedLapTimes.get(rider.name);
      if (expectedLap === undefined) {
        return;
      }

      const lapCount = categoryLapCounts.get(rider.category) ?? 1;
      const projectedRaceTime = expectedLap * lapCount;
      const slowestProjected = categorySlowestProjected.get(rider.category) ?? projectedRaceTime;
      const startOffsetSeconds = Math.max(0, slowestProjected - projectedRaceTime);
      const roundedStartOffsetSeconds = roundToNearestInterval(startOffsetSeconds, startOffsetIntervalSeconds);

      projections.set(rider.name, {
        expectedLapTimeSeconds: expectedLap,
        lapCount,
        projectedRaceTimeSeconds: projectedRaceTime,
        roundedStartOffsetSeconds,
        startOffsetSeconds,
      });
    });

    return projections;
  }, [
    fasterRider,
    fasterRiderLapTimeInput,
    projectionError,
    raceDurationInput,
    riders,
    slowerRider,
    slowerRiderLapTimeInput,
    startOffsetIntervalSeconds,
  ]);

  const getProjectedLapInputForRider = (riderName: string): string | undefined => {
    const projection = riderProjections.get(riderName);
    if (!projection) {
      return undefined;
    }

    return projectedLapTimeInput(projection.expectedLapTimeSeconds);
  };

  const roundColumns = useMemo((): RoundColumn[] => {
    if (!snapshot) {
      return [];
    }

    const eventNameById = new Map<number, string>(snapshot.events.map((event) => [event.eventId, event.name]));
    const eventDateById = new Map<number, string>(snapshot.events.map((event) => [event.eventId, event.eventDate]));
    const roundColumnByEventId = new Map<number, RoundColumn>();

    snapshot.riders.forEach((rider: HandicapRiderSnapshot) => {
      Object.values(rider.roundsByEventId).forEach((round: HandicapRoundSnapshot) => {
        const existingRoundColumn = roundColumnByEventId.get(round.eventId);
        if (!existingRoundColumn || round.eventNumber < existingRoundColumn.eventNumber) {
          roundColumnByEventId.set(round.eventId, {
            eventDate: eventDateById.get(round.eventId),
            eventId: round.eventId,
            eventName: eventNameById.get(round.eventId),
            eventNumber: round.eventNumber,
          });
        }
      });
    });

    return Array.from(roundColumnByEventId.values()).sort((a: RoundColumn, b: RoundColumn) => a.eventNumber - b.eventNumber);
  }, [snapshot]);

  const roundExtremesByEventId = useMemo(() => {
    const extremes = new Map<number, RoundExtremes>();

    roundColumns.forEach((roundColumn: RoundColumn) => {
      const roundValues = riders
        .map((rider: HandicapRiderSnapshot) => ({
          riderName: rider.name,
          round: rider.roundsByEventId[String(roundColumn.eventId)],
        }))
        .filter((entry) => entry.round !== undefined);

      const metricEntries = roundValues
        .map((entry) => {
          const metric = entry.round.ratioScore ?? entry.round.medianLapTime;
          return metric === null ? undefined : { metric, riderName: entry.riderName };
        })
        .filter((entry): entry is { metric: number; riderName: string } => entry !== undefined);

      if (metricEntries.length === 0) {
        extremes.set(roundColumn.eventId, {
          fastestRiderNames: new Set<string>(),
          slowestRiderNames: new Set<string>(),
        });
        return;
      }

      const minMetric = Math.min(...metricEntries.map((entry) => entry.metric));
      const maxMetric = Math.max(...metricEntries.map((entry) => entry.metric));

      extremes.set(roundColumn.eventId, {
        fastestRiderNames: new Set<string>(metricEntries.filter((entry) => entry.metric === minMetric).map((entry) => entry.riderName)),
        slowestRiderNames: new Set<string>(metricEntries.filter((entry) => entry.metric === maxMetric).map((entry) => entry.riderName)),
      });
    });

    return extremes;
  }, [riders, roundColumns]);

  if (isLoading) {
    return <p>Loading handicap snapshot...</p>;
  }

  if (error) {
    return (
      <div>
        <h2>Handicap Data</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div>
        <h2>Handicap Data</h2>
        <p>No handicap snapshot data available.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Handicap Data</h2>
      <p>
        Generated: {new Date(snapshot.generatedAt).toLocaleString()} | Schema: {snapshot.schemaVersion} | Events: {snapshot.events.length}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Race Duration (MM:SS)
          <input
            onChange={(event) => setRaceDurationInput(event.target.value)}
            type="text"
            value={raceDurationInput}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Start Offset Interval
          <select
            onChange={(event) => setStartOffsetIntervalSeconds(Number(event.target.value))}
            value={startOffsetIntervalSeconds}
          >
            {START_OFFSET_INTERVAL_OPTIONS.map((intervalSeconds: number) => (
              <option key={intervalSeconds} value={intervalSeconds}>
                {intervalSeconds}s
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Faster Rider
          <select
            onChange={(event) => {
              const selectedName = event.target.value;
              const selectedRider = riderByName.get(selectedName);
              setFasterRiderName(selectedName);
              setFasterRiderLapTimeInput(getProjectedLapInputForRider(selectedName) ?? defaultLapTimeInput(selectedRider));
            }}
            value={fasterRiderName}
          >
            <option value="">Select rider</option>
            {selectableFasterRiders.map((rider: HandicapRiderSnapshot) => (
              <option key={rider.name} value={rider.name}>{capitalize(rider.firstName)} {capitalize(rider.surname)} ({rider.handicapRatio.toFixed(4)})</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Faster Rider Lap (MM:SS)
          <input
            onChange={(event) => setFasterRiderLapTimeInput(event.target.value)}
            type="text"
            value={fasterRiderLapTimeInput}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Slower Rider
          <select
            onChange={(event) => {
              const selectedName = event.target.value;
              const selectedRider = riderByName.get(selectedName);
              setSlowerRiderName(selectedName);
              setSlowerRiderLapTimeInput(getProjectedLapInputForRider(selectedName) ?? defaultLapTimeInput(selectedRider));
            }}
            value={slowerRiderName}
          >
            <option value="">Select rider</option>
            {selectableSlowerRiders.map((rider: HandicapRiderSnapshot) => (
              <option key={rider.name} value={rider.name}>{capitalize(rider.firstName)} {capitalize(rider.surname)} ({rider.handicapRatio.toFixed(4)})</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Slower Rider Lap (MM:SS)
          <input
            onChange={(event) => setSlowerRiderLapTimeInput(event.target.value)}
            type="text"
            value={slowerRiderLapTimeInput}
          />
        </label>
      </div>
      {projectionError && <p>{projectionError}</p>}
      <TableContainer component={Paper}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>First Name</TableCell>
              <TableCell>Surname</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Handicap Ratio</TableCell>
              <TableCell align="right">Expected Lap</TableCell>
              <TableCell align="right">Target Laps</TableCell>
              <TableCell align="right">Projected Race Time</TableCell>
              <TableCell align="right">Start Offset ({startOffsetIntervalSeconds}s)</TableCell>
              {roundColumns.map((roundColumn: RoundColumn) => (
                <TableCell key={roundColumn.eventId} align="right">
                  <div>R{roundColumn.eventNumber}</div>
                  {roundColumn.eventName && <div style={{ fontSize: '0.8em', fontWeight: 'normal' }}>{roundColumn.eventName}</div>}
                  {roundColumn.eventDate && <div style={{ fontSize: '0.75em', fontWeight: 'normal' }}>{roundColumn.eventDate}</div>}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {riders.map((rider: HandicapRiderSnapshot, index: number) => (
              <TableRow key={rider.name}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{capitalize(rider.firstName)}</TableCell>
                <TableCell>{capitalize(rider.surname)}</TableCell>
                <TableCell>{capitalize(rider.category)}</TableCell>
                <TableCell align="right">{rider.handicapRatio.toFixed(4)}</TableCell>
                <TableCell align="right">{riderProjections.get(rider.name) ? formatRoundedSeconds(riderProjections.get(rider.name)!.expectedLapTimeSeconds) : ''}</TableCell>
                <TableCell align="right">{riderProjections.get(rider.name)?.lapCount ?? ''}</TableCell>
                <TableCell align="right">{riderProjections.get(rider.name) ? formatRoundedSeconds(riderProjections.get(rider.name)!.projectedRaceTimeSeconds) : ''}</TableCell>
                <TableCell align="right" title={riderProjections.get(rider.name) ? `Exact: ${formatRoundedSeconds(riderProjections.get(rider.name)!.startOffsetSeconds)}` : ''}>
                  {riderProjections.get(rider.name) ? formatRoundedSeconds(riderProjections.get(rider.name)!.roundedStartOffsetSeconds) : ''}
                </TableCell>
                {roundColumns.map((roundColumn: RoundColumn) => (
                  <TableCell key={`${rider.name}-${roundColumn.eventId}`} align="right">
                    {formatRoundCell(
                      rider.roundsByEventId[String(roundColumn.eventId)],
                      Boolean(
                        roundExtremesByEventId.get(roundColumn.eventId)?.fastestRiderNames.has(rider.name) ||
                        roundExtremesByEventId.get(roundColumn.eventId)?.slowestRiderNames.has(rider.name)
                      )
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};
