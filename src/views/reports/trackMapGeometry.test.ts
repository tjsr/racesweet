import { describe, expect, it } from 'vitest';
import { createCircularTrack, createTrackMapGeometry, getClosestTrackProgress, getTrackPointAtProgress, parseGpxTrack } from './trackMapGeometry.js';

describe('track map geometry', () => {
  it('parses and scales GPX track points into the map view box', () => {
    const points = parseGpxTrack(`<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="-33.0000" lon="151.0000" />
      <trkpt lat="-33.0010" lon="151.0020" />
      <trkpt lat="-33.0020" lon="151.0000" />
    </trkseg></trk></gpx>`);

    expect(points).toHaveLength(3);
    expect(points.every((point) => point.x >= 6 && point.x <= 94 && point.y >= 6 && point.y <= 94)).toBe(true);
  });

  it('uses a circular fallback and projects timing-line clicks onto the track', () => {
    const points = createCircularTrack(32);
    const progress = getClosestTrackProgress(points, getTrackPointAtProgress(points, 0.25));

    expect(points).toHaveLength(32);
    expect(progress).toBeCloseTo(0.25, 2);
    expect(parseGpxTrack('not GPX')).toHaveLength(128);
  });

  it('parses racetrack-database track widths and scales its racing line in the same coordinate space', () => {
    const geometry = createTrackMapGeometry({
      racingLineCsvContent: '# x_m,y_m\n1,0\n9,0\n9,10\n1,10',
      racingLineCsvFileName: 'IMS.csv',
      sourceType: 'racetrack-csv',
      timingLines: [],
      trackCsvContent: '# x_m,y_m,w_tr_right_m,w_tr_left_m\n0,0,2,3\n10,0,2,3\n10,10,2,3\n0,10,2,3',
      trackCsvFileName: 'IMS.csv',
    });

    expect(geometry.trackPoints).toHaveLength(4);
    expect(geometry.leftBoundaryPoints).toHaveLength(4);
    expect(geometry.rightBoundaryPoints).toHaveLength(4);
    expect(geometry.racingLinePoints).toHaveLength(4);
    expect(geometry.entrantPathPoints).toBe(geometry.racingLinePoints);
    expect([
      ...geometry.trackPoints,
      ...geometry.leftBoundaryPoints!,
      ...geometry.rightBoundaryPoints!,
      ...geometry.racingLinePoints!,
    ].every((point) => point.x >= 6 && point.x <= 94 && point.y >= 6 && point.y <= 94)).toBe(true);
  });
});
