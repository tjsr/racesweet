import { mapSourcePosition, type Position } from 'source-map-support';
import { readFileSync } from 'node:fs';
import { SourceMapConsumer } from 'source-map-support/node_modules/source-map';

export type SourcePositionMapper = (position: Position) => Position;
type SourceMapConsumerInstance = InstanceType<typeof SourceMapConsumer>;

const stackFrameLocationPattern =
  /(?<source>(?:[A-Za-z]:\\|file:\/\/\/|https?:\/\/|webpack:\/\/|\/|\.{1,2}\/)[^)\s]+):(?<line>\d+):(?<column>\d+)/;

const stackFrameMethodPattern =
  /^(?<prefix>\s*at\s+)(?<method>.+?)(?<suffix>\s+\(.+\))$/;

const formatSourcePosition = (position: Position): string =>
  `${position.source}:${position.line}:${position.column + 1}`;

const normalizeMappedStackText = (stack: string): string =>
  stack
    .replace(/webpack:\/\/racesweet\/\.\/[^)\s]*?webpack:\/racesweet\/([^)\s]+)/gi, 'webpack://racesweet/./$1')
    .replace(/webpack:\/\/racesweet\/(?!\.\/)/g, 'webpack://racesweet/./');

const getSourceFileName = (source: string): string | undefined => {
  const cleanSource = source.split(/[?#]/)[0] || source;
  return cleanSource.split(/[\\/]/).pop();
};

const getMethodAnnotation = (source: string, lineNumber: number): string | undefined => {
  const sourceFileName = getSourceFileName(source);
  if (!sourceFileName) {
    return undefined;
  }

  return `${sourceFileName}:${lineNumber}`;
};

const annotateStackFrameMethod = (line: string, source: string, lineNumber: number): string => {
  const annotation = getMethodAnnotation(source, lineNumber);
  const methodMatch = stackFrameMethodPattern.exec(line);
  if (!annotation || !methodMatch?.groups || methodMatch.groups.method.includes(`[${annotation}]`)) {
    return line;
  }

  return `${methodMatch.groups.prefix}${methodMatch.groups.method} [${annotation}]${methodMatch.groups.suffix}`;
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const sourceMapConsumers = new Map<string, SourceMapConsumerInstance | undefined>();

const getLocalWebpackSourceCandidates = (source: string): string[] => {
  if (isHttpUrl(source)) {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(source).pathname);
    } catch {
      return [];
    }

    const generatedFileName = pathname.split('/').pop();
    if (!generatedFileName) {
      return [];
    }

    const normalizedPath = pathname.replace(/\\/g, '/');
    const isRendererFrame = normalizedPath.includes('/main_window/');
    if (!isRendererFrame) {
      return [];
    }

    const cwd = process.cwd();
    return [
      `${cwd}\\.webpack\\renderer\\main_window\\${generatedFileName}`,
      `${cwd}\\.webpack\\x64\\renderer\\main_window\\${generatedFileName}`,
      `${cwd}\\.webpack\\arm64\\renderer\\main_window\\${generatedFileName}`,
    ];
  }

  const normalizedSource = source.replace(/\//g, '\\');
  if (!normalizedSource.includes('\\.webpack\\')) {
    return [];
  }

  return [source];
};

const readSourceMapConsumer = (source: string): SourceMapConsumerInstance | undefined => {
  const mapPath = `${source}.map`;
  if (sourceMapConsumers.has(mapPath)) {
    return sourceMapConsumers.get(mapPath);
  }

  try {
    const mapData = JSON.parse(readFileSync(mapPath, 'utf8'));
    const consumer = new SourceMapConsumer(mapData) as SourceMapConsumerInstance;
    sourceMapConsumers.set(mapPath, consumer);
    return consumer;
  } catch {
    sourceMapConsumers.set(mapPath, undefined);
    return undefined;
  }
};

const normalizeMappedSource = (source: string): string => {
  const webpackPrefix = 'webpack://racesweet/';
  const normalized = source.replace(/\\/g, '/');
  const embeddedWebpackMatch = /webpack:\/racesweet\/(?<sourcePath>.+)$/i.exec(normalized);
  if (embeddedWebpackMatch?.groups?.sourcePath) {
    return `${webpackPrefix}./${embeddedWebpackMatch.groups.sourcePath}`;
  }

  if (normalized.startsWith(`${webpackPrefix}./`)) {
    return normalized;
  }

  if (normalized.startsWith(webpackPrefix)) {
    return `${webpackPrefix}./${normalized.slice(webpackPrefix.length)}`;
  }

  if (normalized.startsWith('webpack://')) {
    return normalized;
  }

  const sourcePath = normalized.replace(/^webpack:\/\//, '').replace(/^\/+/, '');
  return `${webpackPrefix}${sourcePath}`;
};

const mapWithLocalSourceMap = (position: Position): Position | undefined => {
  const sourceCandidates = getLocalWebpackSourceCandidates(position.source);

  for (const source of sourceCandidates) {
    const consumer = readSourceMapConsumer(source);
    const mappedPosition = consumer?.originalPositionFor({
      column: position.column,
      line: position.line,
    });

    if (mappedPosition?.source && mappedPosition.line != null && mappedPosition.column != null) {
      return {
        column: mappedPosition.column,
        line: mappedPosition.line,
        source: normalizeMappedSource(mappedPosition.source),
      };
    }
  }

  return undefined;
};

const mapWithFallbackCandidates = (position: Position, mapPosition: SourcePositionMapper): Position => {
  const sourceCandidates = [position.source, ...getLocalWebpackSourceCandidates(position.source)];

  for (const source of sourceCandidates) {
    const candidatePosition: Position = { ...position, source };

    let mappedPosition: Position;
    try {
      mappedPosition = mapPosition(candidatePosition);
    } catch {
      continue;
    }

    if (
      mappedPosition.source !== candidatePosition.source ||
      mappedPosition.line !== candidatePosition.line ||
      mappedPosition.column !== candidatePosition.column
    ) {
      return {
        ...mappedPosition,
        source: normalizeMappedSource(mappedPosition.source),
      };
    }
  }

  return mapWithLocalSourceMap(position) || mapPosition(position);
};

export const remapStackTrace = (
  stack: string,
  mapPosition: SourcePositionMapper = mapSourcePosition
): string =>
  normalizeMappedStackText(stack.split('\n').map((line) => {
    const match = stackFrameLocationPattern.exec(line);
    if (!match?.groups) {
      return line;
    }

    const source = match.groups.source;
    const parsedLine = Number(match.groups.line);
    const parsedColumn = Number(match.groups.column);
    if (!source || !Number.isFinite(parsedLine) || !Number.isFinite(parsedColumn)) {
      return line;
    }

    const mappedPosition = mapWithFallbackCandidates({
      column: parsedColumn - 1,
      line: parsedLine,
      source,
    }, mapPosition);

    const mappedLine = line.replace(match[0], formatSourcePosition(mappedPosition));
    return annotateStackFrameMethod(mappedLine, mappedPosition.source, mappedPosition.line);
  }).join('\n'));

export const formatErrorForDisplay = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [
    error.message,
    error.stack ? remapStackTrace(error.stack) : undefined,
  ].filter((value): value is string => !!value);

  if (error.cause !== undefined) {
    details.push(`Caused by:\n${formatErrorForDisplay(error.cause)}`);
  }

  return details.join('\n');
};
