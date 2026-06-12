import { mapSourcePosition, type Position } from 'source-map-support';

export type SourcePositionMapper = (position: Position) => Position;

const stackFrameLocationPattern =
  /(?<source>(?:[A-Za-z]:\\|file:\/\/\/|https?:\/\/|webpack:\/\/|\/|\.{1,2}\/)[^)\s]+):(?<line>\d+):(?<column>\d+)/;

const stackFrameMethodPattern =
  /^(?<prefix>\s*at\s+)(?<method>.+?)(?<suffix>\s+\(.+\))$/;

const formatSourcePosition = (position: Position): string =>
  `${position.source}:${position.line}:${position.column + 1}`;

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

const getLocalWebpackSourceCandidates = (source: string): string[] => {
  if (!isHttpUrl(source)) {
    return [];
  }

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
      return mappedPosition;
    }
  }

  return mapPosition(position);
};

export const remapStackTrace = (
  stack: string,
  mapPosition: SourcePositionMapper = mapSourcePosition
): string =>
  stack.split('\n').map((line) => {
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
  }).join('\n');

export const formatErrorForDisplay = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const message = error.message;
  if (!error.stack) {
    return message;
  }

  return `${message}\n${remapStackTrace(error.stack)}`;
};
