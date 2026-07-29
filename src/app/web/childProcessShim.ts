export const execFile = (): never => {
  throw new Error('Native executables can only be run by the RaceSweet server.');
};
