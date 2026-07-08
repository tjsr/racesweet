export interface CtcRawCrossingRecord {
  absoluteTimeTicks?: number;
  confidence?: string;
  drtCode: string;
  laneNumber?: number;
  lineNumber?: number;
  raw: string;
  rawTimeTicks: number;
  recordNumber: number;
  specialType?: 'event' | 'start-of-race' | 'yellow-flag' | 'yellow-end';
  status?: string;
  timeText?: string;
  transmitter?: number;
}

const DRT_LENGTH = 2;
const TIME_START = 2;
const TIME_LENGTH = 14;
const TX8000_CAR_START = 16;
const TX8000_CAR_LENGTH = 4;
const TX8000_LINE_START = 20;
const TX8000_LINE_LENGTH = 2;
const LANE_START = 22;
const LANE_LENGTH = 2;
const CONFIDENCE_START = 24;
const CONFIDENCE_LENGTH = 3;
const STATUS_START = 27;
const STATUS_LENGTH = 3;
const LEGACY_VISIBLE_TIME_PATTERN = /^(?<prefix>\d+)\s+(?<sequence>\d+)\s+(?<time>\d{2}:\d{2}:\d{2}\.\d{4})\s+(?<status>\d{2,3})$/;
const SPECIAL_EVENT_PATTERN = /^(?<code>[0-9A-F]{2})(?<absolute>\d{14})$/i;

const parseInteger = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const readSlice = (line: string, start: number, length: number): string => line.slice(start, start + length);

const parseTenThousandthsTimeText = (value: string): number | undefined => {
  const match = /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<fraction>\d{4})$/.exec(value.trim());
  if (!match?.groups) {
    return undefined;
  }

  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes);
  const seconds = Number(match.groups.seconds);
  const fraction = Number(match.groups.fraction);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    !Number.isInteger(fraction)
  ) {
    return undefined;
  }

  return ((((hours * 60) + minutes) * 60) + seconds) * 10000 + fraction;
};

const formatTenThousandthsTimeText = (ticks: number): string | undefined => {
  if (!Number.isFinite(ticks) || ticks < 0) {
    return undefined;
  }

  const ticksPerDay = 24 * 60 * 60 * 10000;
  const normalizedTicks = Math.trunc(ticks) % ticksPerDay;
  const totalSeconds = Math.floor(normalizedTicks / 10000);
  const fraction = normalizedTicks % 10000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(4, '0')}`;
};

const getSpecialRecordType = (drtCode: string): CtcRawCrossingRecord['specialType'] | undefined => {
  switch (drtCode.toUpperCase()) {
  case '40':
    return 'start-of-race';
  case '4D':
    return 'yellow-flag';
  case '4E':
    return 'yellow-end';
  case 'E1':
    return 'event';
  default:
    return undefined;
  }
};

export const splitCtcRawCrossingLines = (buffer: Buffer | string): string[] => {
  return buffer
    .toString()
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

export const parseCtcRawCrossingLine = (
  line: string,
  recordNumber = 1
): CtcRawCrossingRecord | undefined => {
  const raw = line.trim();
  const specialMatch = SPECIAL_EVENT_PATTERN.exec(raw);
  if (specialMatch?.groups) {
    const absoluteTimeTicks = parseInteger(specialMatch.groups.absolute);
    if (absoluteTimeTicks === undefined) {
      return undefined;
    }

    return {
      absoluteTimeTicks,
      drtCode: specialMatch.groups.code.toUpperCase(),
      raw,
      rawTimeTicks: absoluteTimeTicks,
      recordNumber,
      specialType: getSpecialRecordType(specialMatch.groups.code),
    };
  }

  const legacyMatch = LEGACY_VISIBLE_TIME_PATTERN.exec(raw);
  if (legacyMatch?.groups) {
    const rawTimeTicks = parseTenThousandthsTimeText(legacyMatch.groups.time);
    const absoluteTimeTicks = parseInteger(legacyMatch.groups.prefix.slice(-14));
    const transmitterText = legacyMatch.groups.prefix.slice(0, 4);
    const transmitter = parseInteger(transmitterText);
    if (rawTimeTicks === undefined) {
      return undefined;
    }

    return {
      absoluteTimeTicks,
      drtCode: 'SRT',
      raw,
      rawTimeTicks,
      recordNumber,
      status: legacyMatch.groups.status,
      timeText: legacyMatch.groups.time,
      transmitter,
    };
  }

  if (raw.length < STATUS_START || !/^\d+$/.test(raw)) {
    return undefined;
  }

  const absoluteTimeTicks = parseInteger(readSlice(raw, TIME_START, TIME_LENGTH));
  if (absoluteTimeTicks === undefined) {
    return undefined;
  }

  const transmitter = parseInteger(readSlice(raw, TX8000_CAR_START, TX8000_CAR_LENGTH));
  const lineNumber = parseInteger(readSlice(raw, TX8000_LINE_START, TX8000_LINE_LENGTH));
  const laneNumber = parseInteger(readSlice(raw, LANE_START, LANE_LENGTH));
  const confidence = readSlice(raw, CONFIDENCE_START, CONFIDENCE_LENGTH).trim();
  const status = readSlice(raw, STATUS_START, STATUS_LENGTH).trim();

  return {
    confidence: confidence.length > 0 ? confidence : undefined,
    drtCode: readSlice(raw, 0, DRT_LENGTH),
    laneNumber,
    lineNumber,
    raw,
    rawTimeTicks: absoluteTimeTicks,
    recordNumber,
    absoluteTimeTicks,
    status: status.length > 0 ? status : undefined,
    timeText: undefined,
    transmitter,
  };
};

export const parseCtcRawCrossingFile = (buffer: Buffer | string): CtcRawCrossingRecord[] => {
  const records = splitCtcRawCrossingLines(buffer)
    .map((line, index) => parseCtcRawCrossingLine(line, index + 1))
    .filter((record): record is CtcRawCrossingRecord => record !== undefined);

  const offsetRecord = records.find((record) => record.absoluteTimeTicks !== undefined && record.timeText !== undefined);
  if (!offsetRecord?.timeText || offsetRecord.absoluteTimeTicks === undefined) {
    return records;
  }

  const timeOfDayTicks = parseTenThousandthsTimeText(offsetRecord.timeText);
  if (timeOfDayTicks === undefined) {
    return records;
  }

  const absoluteOffset = offsetRecord.absoluteTimeTicks - timeOfDayTicks;
  return records.map((record) => {
    if (record.timeText !== undefined || record.absoluteTimeTicks === undefined) {
      return record;
    }

    const derivedTimeTicks = record.absoluteTimeTicks - absoluteOffset;
    const derivedTimeText = formatTenThousandthsTimeText(derivedTimeTicks);
    if (!derivedTimeText) {
      return record;
    }

    return {
      ...record,
      rawTimeTicks: derivedTimeTicks,
      timeText: derivedTimeText,
    };
  });
};
