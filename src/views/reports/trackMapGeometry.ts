import type { EventTrackMap } from '../../catalog/eventCatalog.js';

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackMapGeometry {
  entrantPathPoints: TrackPoint[];
  leftBoundaryPoints?: TrackPoint[];
  racingLinePoints?: TrackPoint[];
  rightBoundaryPoints?: TrackPoint[];
  trackPoints: TrackPoint[];
}

interface RacetrackCsvPoint extends TrackPoint {
  leftWidth: number;
  rightWidth: number;
}

const VIEW_BOX_SIZE = 100;
const VIEW_BOX_PADDING = 6;

const parseCsvNumbers = (line: string): number[] | undefined => {
  const values = line.split(',').map((value) => Number(value.trim()));
  return values.length >= 2 && values.every(Number.isFinite) ? values : undefined;
};

const parseCartesianCsvPoints = (content: string | undefined): TrackPoint[] => {
  if (!content?.trim()) {
    return [];
  }
  return content.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(parseCsvNumbers)
    .filter((values): values is number[] => values !== undefined)
    .map((values) => ({ x: values[0]!, y: values[1]! }));
};

const parseRacetrackCsvPoints = (content: string | undefined): RacetrackCsvPoint[] => {
  if (!content?.trim()) {
    return [];
  }
  return content.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(parseCsvNumbers)
    .filter((values): values is number[] => values !== undefined && values.length >= 4)
    .map((values) => ({
      leftWidth: Math.max(0, values[3]!),
      rightWidth: Math.max(0, values[2]!),
      x: values[0]!,
      y: values[1]!,
    }));
};

const getTrackBoundaries = (points: RacetrackCsvPoint[]): { left: TrackPoint[]; right: TrackPoint[] } => {
  const left: TrackPoint[] = [];
  const right: TrackPoint[] = [];
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length] || point;
    const next = points[(index + 1) % points.length] || point;
    const deltaX = next.x - previous.x;
    const deltaY = next.y - previous.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    left.push({ x: point.x + normalX * point.leftWidth, y: point.y + normalY * point.leftWidth });
    right.push({ x: point.x - normalX * point.rightWidth, y: point.y - normalY * point.rightWidth });
  });
  return { left, right };
};

const scaleCartesianPointSets = (pointSets: TrackPoint[][]): TrackPoint[][] => {
  const allPoints = pointSets.flat();
  if (allPoints.length < 2) {
    return pointSets;
  }
  const minimumX = Math.min(...allPoints.map((point) => point.x));
  const maximumX = Math.max(...allPoints.map((point) => point.x));
  const minimumY = Math.min(...allPoints.map((point) => point.y));
  const maximumY = Math.max(...allPoints.map((point) => point.y));
  const width = Math.max(Number.EPSILON, maximumX - minimumX);
  const height = Math.max(Number.EPSILON, maximumY - minimumY);
  const availableSize = VIEW_BOX_SIZE - VIEW_BOX_PADDING * 2;
  const scale = Math.min(availableSize / width, availableSize / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const offsetX = (VIEW_BOX_SIZE - renderedWidth) / 2;
  const offsetY = (VIEW_BOX_SIZE - renderedHeight) / 2;
  return pointSets.map((points) => points.map((point) => ({
    x: offsetX + (point.x - minimumX) * scale,
    y: offsetY + (maximumY - point.y) * scale,
  })));
};

const getAttributeNumber = (attributes: string, name: string): number | undefined => {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attributes);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

export const createCircularTrack = (pointCount = 128): TrackPoint[] => {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2 - Math.PI / 2;
    return {
      x: VIEW_BOX_SIZE / 2 + Math.cos(angle) * 40,
      y: VIEW_BOX_SIZE / 2 + Math.sin(angle) * 40,
    };
  });
};

export const parseGpxTrack = (gpxContent: string | undefined): TrackPoint[] => {
  if (!gpxContent?.trim()) {
    return createCircularTrack();
  }

  const coordinates = Array.from(gpxContent.matchAll(/<(?:trkpt|rtept|wpt)\b([^>]*)>/gi))
    .map((match) => ({
      latitude: getAttributeNumber(match[1] || '', 'lat'),
      longitude: getAttributeNumber(match[1] || '', 'lon'),
    }))
    .filter((point): point is { latitude: number; longitude: number } => (
      point.latitude !== undefined && point.longitude !== undefined
    ));
  if (coordinates.length < 2) {
    return createCircularTrack();
  }

  const averageLatitudeRadians = coordinates.reduce((sum, point) => sum + point.latitude, 0) /
    coordinates.length * Math.PI / 180;
  const projected = coordinates.map((point) => ({
    x: point.longitude * Math.cos(averageLatitudeRadians),
    y: -point.latitude,
  }));
  const minimumX = Math.min(...projected.map((point) => point.x));
  const maximumX = Math.max(...projected.map((point) => point.x));
  const minimumY = Math.min(...projected.map((point) => point.y));
  const maximumY = Math.max(...projected.map((point) => point.y));
  const width = Math.max(Number.EPSILON, maximumX - minimumX);
  const height = Math.max(Number.EPSILON, maximumY - minimumY);
  const availableSize = VIEW_BOX_SIZE - VIEW_BOX_PADDING * 2;
  const scale = Math.min(availableSize / width, availableSize / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const offsetX = (VIEW_BOX_SIZE - renderedWidth) / 2;
  const offsetY = (VIEW_BOX_SIZE - renderedHeight) / 2;

  return projected.map((point) => ({
    x: offsetX + (point.x - minimumX) * scale,
    y: offsetY + (point.y - minimumY) * scale,
  }));
};

export const createTrackMapGeometry = (trackMap: EventTrackMap | undefined): TrackMapGeometry => {
  const useCsv = trackMap?.sourceType === 'racetrack-csv' || (!trackMap?.gpxContent && !!trackMap?.trackCsvContent);
  if (!useCsv) {
    const trackPoints = parseGpxTrack(trackMap?.gpxContent);
    return { entrantPathPoints: trackPoints, trackPoints };
  }

  const centerline = parseRacetrackCsvPoints(trackMap?.trackCsvContent);
  if (centerline.length < 2) {
    const trackPoints = createCircularTrack();
    return { entrantPathPoints: trackPoints, trackPoints };
  }
  const boundaries = getTrackBoundaries(centerline);
  const racingLine = parseCartesianCsvPoints(trackMap?.racingLineCsvContent);
  const [trackPoints, leftBoundaryPoints, rightBoundaryPoints, racingLinePoints] = scaleCartesianPointSets([
    centerline,
    boundaries.left,
    boundaries.right,
    racingLine,
  ]);
  const validRacingLine = racingLinePoints && racingLinePoints.length >= 2 ? racingLinePoints : undefined;
  return {
    entrantPathPoints: validRacingLine || trackPoints!,
    leftBoundaryPoints,
    racingLinePoints: validRacingLine,
    rightBoundaryPoints,
    trackPoints: trackPoints!,
  };
};

const getTrackSegments = (points: TrackPoint[]): Array<{ end: TrackPoint; length: number; start: TrackPoint }> => {
  if (points.length < 2) {
    return [];
  }
  return points.map((start, index) => {
    const end = points[(index + 1) % points.length]!;
    return {
      end,
      length: Math.hypot(end.x - start.x, end.y - start.y),
      start,
    };
  });
};

export const getTrackPointAtProgress = (points: TrackPoint[], progress: number): TrackPoint => {
  const segments = getTrackSegments(points);
  if (segments.length === 0) {
    return points[0] || { x: VIEW_BOX_SIZE / 2, y: VIEW_BOX_SIZE / 2 };
  }
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const normalizedProgress = ((progress % 1) + 1) % 1;
  let remainingDistance = normalizedProgress * totalLength;

  for (const segment of segments) {
    if (remainingDistance <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remainingDistance / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remainingDistance -= segment.length;
  }

  return segments[segments.length - 1]!.end;
};

export const getClosestTrackProgress = (points: TrackPoint[], target: TrackPoint): number => {
  const segments = getTrackSegments(points);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) {
    return 0;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let distanceBeforeSegment = 0;
  segments.forEach((segment) => {
    const deltaX = segment.end.x - segment.start.x;
    const deltaY = segment.end.y - segment.start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const ratio = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((target.x - segment.start.x) * deltaX + (target.y - segment.start.y) * deltaY) / lengthSquared));
    const candidate = {
      x: segment.start.x + deltaX * ratio,
      y: segment.start.y + deltaY * ratio,
    };
    const distance = Math.hypot(target.x - candidate.x, target.y - candidate.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = (distanceBeforeSegment + segment.length * ratio) / totalLength;
    }
    distanceBeforeSegment += segment.length;
  });
  return bestProgress;
};

export const toSvgPolylinePoints = (points: TrackPoint[]): string => {
  const closedPoints = points.length > 1 ? [...points, points[0]!] : points;
  return closedPoints.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ');
};
