export interface SrtRecord {
  absoluteTicks?: number;
  confidence?: string;
  controlMeaning?: string;
  drtCode: string;
  hitCount?: number;
  lineNumber?: number;
  loopNumber?: number;
  raw: string;
  recordNumber: number;
  status?: string;
  timeOfDay?: string;
  transmitter?: number;
}

const COMPACT_RECORD_PATTERN = /^\d+$/;
const CONTROL_RECORD_PATTERN = /^(?<code>[0-9A-F]{2})(?<ticks>\d{14})$/i;
const VISIBLE_TIME_PATTERN = /^(?<prefix>\d+)\s+(?<sequence>\d+)\s+(?<time>\d{2}:\d{2}:\d{2}\.\d{4})\s+(?<status>\d{2,3})$/;
const TICKS_PER_DAY = 24 * 60 * 60 * 10_000;

const parseInteger = (value: string): number | undefined => {
  const parsed: number = Number(value.trim());
  return Number.isSafeInteger(parsed) && /^\d+$/.test(value.trim()) ? parsed : undefined;
};

const formatTimeOfDay = (ticks: number): string | undefined => {
  if (!Number.isFinite(ticks) || ticks < 0) {
    return undefined;
  }

  const normalizedTicks: number = Math.trunc(ticks) % TICKS_PER_DAY;
  const totalSeconds: number = Math.floor(normalizedTicks / 10_000);
  const fraction: number = normalizedTicks % 10_000;
  const hours: number = Math.floor(totalSeconds / 3600);
  const minutes: number = Math.floor((totalSeconds % 3600) / 60);
  const seconds: number = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(4, '0')}`;
};

const timeTextToTicks = (timeText: string): number => {
  const [hoursText, minutesText, secondsAndFraction]: string[] = timeText.split(':');
  const [secondsText, fractionText]: string[] = secondsAndFraction.split('.');
  return (((Number(hoursText) * 60 + Number(minutesText)) * 60 + Number(secondsText)) * 10_000) + Number(fractionText);
};

const getControlMeaning = (drtCode: string): string | undefined => {
  const meanings: Readonly<Record<string, string>> = {
    '40': 'Start of race',
    '4D': 'Yellow/caution start',
    '4E': 'Yellow/caution end / green resume',
    E1: 'Event/control marker',
  };
  return meanings[drtCode.toUpperCase()];
};

const parseRecord = (rawLine: string, recordNumber: number): SrtRecord | undefined => {
  const raw: string = rawLine.trim();
  const controlMatch: RegExpExecArray | null = CONTROL_RECORD_PATTERN.exec(raw);
  if (controlMatch?.groups) {
    const absoluteTicks: number | undefined = parseInteger(controlMatch.groups.ticks);
    if (absoluteTicks === undefined) {
      return undefined;
    }
    const drtCode: string = controlMatch.groups.code.toUpperCase();
    return { absoluteTicks, controlMeaning: getControlMeaning(drtCode), drtCode, raw, recordNumber };
  }

  const visibleTimeMatch: RegExpExecArray | null = VISIBLE_TIME_PATTERN.exec(raw);
  if (visibleTimeMatch?.groups) {
    return {
      absoluteTicks: parseInteger(visibleTimeMatch.groups.prefix.slice(-14)),
      drtCode: 'SRT',
      raw,
      recordNumber,
      status: visibleTimeMatch.groups.status,
      timeOfDay: visibleTimeMatch.groups.time,
      transmitter: parseInteger(visibleTimeMatch.groups.prefix.slice(0, 4)),
    };
  }

  if (raw.length < 30 || !COMPACT_RECORD_PATTERN.test(raw)) {
    return undefined;
  }
  const absoluteTicks: number | undefined = parseInteger(raw.slice(2, 16));
  if (absoluteTicks === undefined) {
    return undefined;
  }
  const confidence: string = raw.slice(24, 27).trim();
  const status: string = raw.slice(27, 30).trim();
  return {
    absoluteTicks,
    confidence: confidence || undefined,
    drtCode: raw.slice(0, 2),
    hitCount: parseInteger(raw.slice(30)),
    lineNumber: parseInteger(raw.slice(20, 22)),
    loopNumber: parseInteger(raw.slice(22, 24)),
    raw,
    recordNumber,
    status: status || undefined,
    transmitter: parseInteger(raw.slice(16, 20)),
  };
};

export const parseSrt = (text: string): SrtRecord[] => {
  const records: SrtRecord[] = text
    .split(/\r\n|\r|\n/)
    .map((line: string, index: number): SrtRecord | undefined => parseRecord(line, index + 1))
    .filter((record: SrtRecord | undefined): record is SrtRecord => record !== undefined);
  const anchor: SrtRecord | undefined = records.find((record: SrtRecord): boolean => record.absoluteTicks !== undefined && record.timeOfDay !== undefined);
  if (!anchor?.timeOfDay || anchor.absoluteTicks === undefined) {
    return records;
  }
  const offset: number = anchor.absoluteTicks - timeTextToTicks(anchor.timeOfDay);
  return records.map((record: SrtRecord): SrtRecord => record.timeOfDay || record.absoluteTicks === undefined
    ? record
    : { ...record, timeOfDay: formatTimeOfDay(record.absoluteTicks - offset) });
};
