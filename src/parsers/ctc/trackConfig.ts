import type {
  CtcTrackConfig,
  CtcTrackConfigLine,
  CtcTrackConfigLoop,
  CtcTrackConfigNetwork,
} from '../../model/ctcTrackConfig.js';

export type CtcTrackConfigInput = Buffer | string | Uint8Array;

interface PendingDescription {
  lineName?: string;
  networkName?: string;
}

const DEFAULT_NETWORK_NAME = 'Default Network';
const DEFAULT_LINE_NAME_PREFIX = 'Line';

const CTC_FLAG_DESCRIPTION_BY_CODE: Record<string, string> = {
  '40': 'Green Flag Light',
  '41': 'Yellow Flag Light',
  '42': 'Red Flag Light',
  '43': 'White Flag',
  '44': 'Checkered Flag',
  '45': 'Start of Race',
  '46': 'End of Race',
  '47': 'Not Allocated',
  '48': 'Green Flag Manual',
  '49': 'Yellow Flag Manual',
  '4A': 'Red Flag Manual',
  '4B': 'White Flag',
  '4C': 'Checkered Flag',
  '4D': 'Start of Race',
  '4E': 'End of Race',
  '4F': 'Not Allocated',
};

const getTrackConfigText = (input: CtcTrackConfigInput): string => (
  typeof input === 'string' ? input : new TextDecoder('latin1').decode(input)
);

const splitTrackConfigLines = (input: CtcTrackConfigInput): string[] => (
  getTrackConfigText(input)
    .split(/\r\n|[\r\n\u0000\u001e\u001f]/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
);

const normalizeEventCode = (code: string): string => code.trim().toUpperCase();

const normalizeName = (value: string | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/gu, ' ').trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const parseCommentDescription = (line: string): PendingDescription | undefined => {
  if (!line.startsWith('#') || !line.endsWith('#')) {
    return undefined;
  }

  const content = line.slice(1, -1);
  const blocks = content
    .split(/\*{2,}/u)
    .map(normalizeName)
    .filter((value): value is string => value !== undefined);

  if (blocks.length === 0) {
    return undefined;
  }

  return {
    lineName: blocks[0],
    networkName: blocks[1],
  };
};

const parseDecimalNumber = (value: string | undefined): number | undefined => {
  if (!value || !/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const findNamedNumber = (line: string, names: string[]): number | undefined => {
  for (const name of names) {
    const match = new RegExp(`\\b${name}\\b\\s*[:=]?\\s*(\\d+)`, 'iu').exec(line);
    const value = parseDecimalNumber(match?.[1]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const parseARecord = (line: string): Array<{ lineNumber: number; loop: CtcTrackConfigLoop }> => {
  if (!/^A\b/iu.test(line)) {
    return [];
  }

  const firstLineLoopMatch = /\d+\s*,\s*\d+/u.exec(line);
  const headerText = firstLineLoopMatch ? line.slice(0, firstLineLoopMatch.index) : line;
  const tokens = headerText.match(/\d+/gu) || [];
  const siteAddress = findNamedNumber(line, ['site', 'siteAddress', 'address']) ?? parseDecimalNumber(tokens[0]);
  const card = findNamedNumber(line, ['card']) ?? parseDecimalNumber(tokens[1]);
  const comPort = findNamedNumber(line, ['com', 'comPort', 'port']) ?? parseDecimalNumber(tokens[2]);

  if (
    siteAddress === undefined ||
    card === undefined ||
    comPort === undefined
  ) {
    return [];
  }

  return Array.from(line.matchAll(/(\d+)\s*,\s*(\d+)/gu))
    .map((match) => {
      const lineNumber = parseDecimalNumber(match[1]);
      const loopNumber = parseDecimalNumber(match[2]);
      if (lineNumber === undefined || loopNumber === undefined) {
        return undefined;
      }

      return {
        lineNumber,
        loop: {
          card,
          comPort,
          loopNumber,
          siteAddress,
        },
      };
    })
    .filter((record): record is { lineNumber: number; loop: CtcTrackConfigLoop } => record !== undefined);
};

const getOrCreateNetwork = (networks: CtcTrackConfigNetwork[], name: string): CtcTrackConfigNetwork => {
  const existing = networks.find((network) => network.name === name);
  if (existing) {
    return existing;
  }

  const network: CtcTrackConfigNetwork = {
    lines: [],
    name,
  };
  networks.push(network);
  return network;
};

const getOrCreateLine = (
  network: CtcTrackConfigNetwork,
  lineNumber: number,
  lineName: string
): CtcTrackConfigLine => {
  const existing = network.lines.find((line) => line.line === lineNumber);
  if (existing) {
    if (!existing.name || existing.name === `${DEFAULT_LINE_NAME_PREFIX} ${lineNumber}`) {
      existing.name = lineName;
    }
    return existing;
  }

  const line: CtcTrackConfigLine = {
    line: lineNumber,
    loops: [],
    name: lineName,
  };
  network.lines.push(line);
  return line;
};

const inferLapCompletionFromLineName = (lineName: string): boolean => {
  const normalized = lineName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized.includes('start') && normalized.includes('finish');
};

const applyInferredLapCompletionDefaults = (networks: CtcTrackConfigNetwork[]): void => {
  const lines = networks.flatMap((network) => network.lines);
  const normalizeLineName = (lineName: string): string => lineName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isPitLine = (line: CtcTrackConfigLine): boolean => normalizeLineName(line.name).includes('pit');
  const isPitStartFinish = (line: CtcTrackConfigLine): boolean => {
    const normalized = normalizeLineName(line.name);
    return isPitLine(line) && normalized.includes('start') && normalized.includes('finish');
  };
  const isPitEntry = (line: CtcTrackConfigLine): boolean => isPitLine(line) && normalizeLineName(line.name).includes('entry');
  const isPitExit = (line: CtcTrackConfigLine): boolean => isPitLine(line) && normalizeLineName(line.name).includes('exit');
  const explicitPitLines = lines.filter(isPitStartFinish);
  const pitFallbackLines = explicitPitLines.length > 0
    ? explicitPitLines
    : lines.filter(isPitEntry).length > 0
      ? lines.filter(isPitEntry)
      : lines.filter(isPitExit);

  pitFallbackLines.forEach((line) => {
    line.loops.forEach((loop) => {
      loop.isLapCompletion = true;
    });
  });
};

const parseHeadingLabels = (line: string): string[] | undefined => {
  if (/^E\b/iu.test(line)) {
    return undefined;
  }

  const blocks = line
    .replace(/^#+|#+$/gu, '')
    .split(/\*{2,}/u)
    .map(normalizeName)
    .filter((value): value is string => value !== undefined);
  const labelledBlock = blocks.find((block) => block.includes(','));
  const trimmed = labelledBlock?.includes(':')
    ? labelledBlock.slice(labelledBlock.indexOf(':') + 1).trim()
    : labelledBlock;
  if (!trimmed?.includes(',')) {
    return undefined;
  }

  const labels = trimmed
    .split(',')
    .map(normalizeName)
    .filter((value): value is string => value !== undefined);

  return labels.length > 1 ? labels : undefined;
};

const addExplicitEventDescription = (line: string, descriptions: Record<string, string>): boolean => {
  const match = /^([0-9A-F]{2})\s+(.+)$/iu.exec(line);
  const code = normalizeEventCode(match?.[1] || '');
  const description = normalizeName(match?.[2]);
  if (!code || !description) {
    return false;
  }

  descriptions[code] = description;
  return true;
};

const addGroupedEventDescriptions = (
  line: string,
  headingLabels: string[] | undefined,
  descriptions: Record<string, string>
): boolean => {
  if (!/^E\b/iu.test(line) || !headingLabels || headingLabels.length === 0) {
    return false;
  }

  const groups = line.match(/[0-9A-F]{2}(?:,[0-9A-F]{2})+/giu) || [];
  groups.forEach((group) => {
    group.split(',').forEach((code, index) => {
      const label = headingLabels[index];
      if (!label) {
        return;
      }
      descriptions[normalizeEventCode(code)] = `${label} Flag Light`;
    });
  });

  return groups.length > 0;
};

export const parseCtcTrackConfig = (
  input: CtcTrackConfigInput,
  filePath?: string
): CtcTrackConfig => {
  const networks: CtcTrackConfigNetwork[] = [];
  const eventDescriptions: Record<string, string> = { ...CTC_FLAG_DESCRIPTION_BY_CODE };
  let pendingDescription: PendingDescription | undefined;
  let pendingHeadingLabels: string[] | undefined;

  splitTrackConfigLines(input).forEach((line) => {
    const commentDescription = parseCommentDescription(line);
    const headingLabels = parseHeadingLabels(line);
    if (headingLabels) {
      pendingHeadingLabels = headingLabels;
    }

    if (commentDescription) {
      pendingDescription = commentDescription;
      return;
    }

    if (addExplicitEventDescription(line, eventDescriptions)) {
      return;
    }

    if (addGroupedEventDescriptions(line, pendingHeadingLabels, eventDescriptions)) {
      return;
    }

    const aRecords = parseARecord(line);
    if (aRecords.length === 0) {
      return;
    }

    aRecords.forEach((aRecord) => {
      const networkName = pendingDescription?.networkName || DEFAULT_NETWORK_NAME;
      const lineName = pendingDescription?.lineName || `${DEFAULT_LINE_NAME_PREFIX} ${aRecord.lineNumber}`;
      const network = getOrCreateNetwork(networks, networkName);
      const trackLine = getOrCreateLine(network, aRecord.lineNumber, lineName);
      const inferredLapCompletion = inferLapCompletionFromLineName(trackLine.name);
      const loop = { ...aRecord.loop, isLapCompletion: inferredLapCompletion };
      if (!trackLine.loops.some((candidate) => candidate.loopNumber === loop.loopNumber && candidate.siteAddress === loop.siteAddress && candidate.card === loop.card)) {
        trackLine.loops.push(loop);
      }
    });
  });

  applyInferredLapCompletionDefaults(networks);

  networks.forEach((network) => {
    network.lines.sort((left, right) => left.line - right.line);
    network.lines.forEach((line) => {
      line.loops.sort((left, right) => left.loopNumber - right.loopNumber);
    });
  });
  networks.sort((left, right) => left.name.localeCompare(right.name));

  return {
    eventDescriptions,
    filePath,
    networks,
  };
};
