import type { EntrantResult } from '../../processing/result.ts';

interface RaceResultProps {
  results: EntrantResult[];
}

const _RaceResult = (props: RaceResultProps) => {
  const { results } = props;

  return (
    <div>
      <h2>Race Results</h2>
      <table>
        <thead>
          <tr>
            <th>Entrant ID</th>
            <th>Lap Count</th>
            <th>Total Time</th>
            <th>Fastest Lap</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.entrantId}>
              <td>{result.entrantId}</td>
              <td>{result.lapCount}</td>
              <td>{result.totalTime}</td>
              <td>{result.fastestLap ? result.fastestLap.lapTime : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
