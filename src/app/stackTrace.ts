import { mapSourcePosition, type Position } from 'source-map-support';

export type SourcePositionMapper = (position: Position) => Position;

const stackFrameLocationPattern =
  /(?<source>(?:[A-Za-z]:\\|file:\/\/\/|https?:\/\/|webpack:\/\/|\/|\.{1,2}\/)[^)\s]+):(?<line>\d+):(?<column>\d+)/;

const formatSourcePosition = (position: Position): string =>
  `${position.source}:${position.line}:${position.column + 1}`;

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

    const mappedPosition = mapPosition({
      column: parsedColumn - 1,
      line: parsedLine,
      source,
    });

    return line.replace(match[0], formatSourcePosition(mappedPosition));
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
