import type { PathLike } from "fs";
import path from "path";

const DATAFILE_DIR = path.resolve(path.join('.', 'src', 'testdata'));

export const getTestFilePath = (fileName: string): PathLike => {
  let filePath = path.join(DATAFILE_DIR, fileName);
  if (filePath.startsWith('\\')) {
    filePath = filePath.replace(/^\\/, '');
  }
  return filePath;
};
