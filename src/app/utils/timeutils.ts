
export const millisecondsToTime = (milliseconds: number): string => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  milliseconds = Math.floor(milliseconds % 1000);
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  return formattedTime;
};

export const elapsedTimeMilliseconds = (start: Date, end: Date): number => {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return endTime - startTime;
};

