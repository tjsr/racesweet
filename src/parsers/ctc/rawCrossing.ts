export interface CtcRawCrossingRecord {
  confidence?: string;
  drtCode: string;
  laneNumber?: number;
  lineNumber?: number;
  raw: string;
  rawTimeTicks: number;
  recordNumber: number;
  status?: string;
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

const parseInteger = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const readSlice = (line: string, start: number, length: number): string => line.slice(start, start + length);

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
  if (raw.length < STATUS_START || !/^\d+$/.test(raw)) {
    return undefined;
  }

  const rawTimeTicks = parseInteger(readSlice(raw, TIME_START, TIME_LENGTH));
  if (rawTimeTicks === undefined) {
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
    rawTimeTicks,
    recordNumber,
    status: status.length > 0 ? status : undefined,
    transmitter,
  };
};

export const parseCtcRawCrossingFile = (buffer: Buffer | string): CtcRawCrossingRecord[] => {
  return splitCtcRawCrossingLines(buffer)
    .map((line, index) => parseCtcRawCrossingLine(line, index + 1))
    .filter((record): record is CtcRawCrossingRecord => record !== undefined);
};
