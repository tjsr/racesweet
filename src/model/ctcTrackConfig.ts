export interface CtcTrackConfigLoop {
  card: number;
  comPort: number;
  isLapCompletion?: boolean;
  loopNumber: number;
  siteAddress: number;
}

export interface CtcTrackConfigLine {
  line: number;
  loops: CtcTrackConfigLoop[];
  name: string;
}

export interface CtcTrackConfigNetwork {
  lines: CtcTrackConfigLine[];
  name: string;
}

export interface CtcTrackConfig {
  eventDescriptions: Record<string, string>;
  filePath?: string;
  networks: CtcTrackConfigNetwork[];
}

export interface CtcTrackConfigLoopLookupResult {
  line: CtcTrackConfigLine;
  loop: CtcTrackConfigLoop;
  network: CtcTrackConfigNetwork;
}

/**
 * Whether this TRACK.CFG has an explicit, persisted per-loop lap-completion
 * selection. Older saved configurations did not have this property, so they
 * continue to use the line-name inference below.
 */
export const hasCtcLapCompletionSelection = (trackConfig: CtcTrackConfig | undefined): boolean => (
  trackConfig?.networks.some((network) => network.lines.some((line) => (
    line.loops.some((loop) => typeof loop.isLapCompletion === 'boolean')
  ))) === true
);

const normalizeCtcLineName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const isPitLineName = (name: string): boolean => {
  const normalized = normalizeCtcLineName(name);
  return normalized.includes('pit') || normalized.includes('pits');
};

const isPitStartFinishLineName = (name: string): boolean => {
  const normalized = normalizeCtcLineName(name);
  return isPitLineName(name) && normalized.includes('start') && normalized.includes('finish');
};

const isPitEntryLineName = (name: string): boolean => {
  const normalized = normalizeCtcLineName(name);
  return isPitLineName(name) && normalized.includes('entry');
};

const isPitExitLineName = (name: string): boolean => {
  const normalized = normalizeCtcLineName(name);
  return isPitLineName(name) && normalized.includes('exit');
};

/**
 * Returns the timing lines that can complete a lap for a CTC source.
 *
 * TRACK.CFG files commonly name the pit timing line "Start/Finish : Pits".
 * Older files may only expose a pit entry or exit line, so use those as a
 * deterministic fallback when an explicit pit start/finish line is absent.
 */
export const getCtcFinishLineNumbers = (trackConfig: CtcTrackConfig | undefined): number[] | undefined => {
  if (!trackConfig) {
    return undefined;
  }

  const lines = trackConfig.networks.flatMap((network) => network.lines);
  if (hasCtcLapCompletionSelection(trackConfig)) {
    const selectedLines = lines
      .filter((line) => line.loops.some((loop) => loop.isLapCompletion === true))
      .map((line) => line.line);
    return Array.from(new Set(selectedLines)).sort((left, right) => left - right);
  }

  const trackStartFinishLines = lines
    .filter((line) => normalizeCtcLineName(line.name).includes('start') && normalizeCtcLineName(line.name).includes('finish'))
    .map((line) => line.line);
  const defaultTrackLines = trackStartFinishLines.length > 0 ? trackStartFinishLines : [1];
  const explicitPitLines = lines.filter((line) => isPitStartFinishLineName(line.name));
  const fallbackPitLines = explicitPitLines.length > 0
    ? explicitPitLines
    : lines.filter((line) => isPitEntryLineName(line.name));
  const selectedPitLines = fallbackPitLines.length > 0
    ? fallbackPitLines
    : lines.filter((line) => isPitExitLineName(line.name));
  const finishLines = Array.from(new Set([...defaultTrackLines, ...selectedPitLines.map((line) => line.line)]));
  return finishLines.length > 0 ? finishLines : undefined;
};

export const findCtcTrackLoopBySiteAddress = (
  trackConfig: CtcTrackConfig | undefined,
  siteAddress: number | undefined,
  loopNumber: number | undefined
): CtcTrackConfigLoopLookupResult | undefined => {
  if (!trackConfig || siteAddress === undefined || loopNumber === undefined) {
    return undefined;
  }

  for (const network of trackConfig.networks) {
    for (const line of network.lines) {
      const loop = line.loops.find((candidate) => (
        candidate.siteAddress === siteAddress &&
        candidate.loopNumber === loopNumber
      ));
      if (loop) {
        return { line, loop, network };
      }
    }
  }

  return undefined;
};

export const findCtcTrackLineName = (
  trackConfig: CtcTrackConfig | undefined,
  lineNumber: number | undefined,
  loopNumber?: number | undefined
): string | undefined => {
  if (!trackConfig || lineNumber === undefined) {
    return undefined;
  }

  for (const network of trackConfig.networks) {
    const line = network.lines.find((candidate) => {
      if (candidate.line !== lineNumber) {
        return false;
      }
      return loopNumber === undefined || candidate.loops.some((loop) => loop.loopNumber === loopNumber);
    }) ?? network.lines.find((candidate) => candidate.line === lineNumber);

    if (line?.name) {
      return line.name;
    }
  }

  return undefined;
};
