const unavailable = (): never => {
  throw new Error('Direct filesystem access is unavailable in a web browser. Upload the file to the RaceSweet server.');
};

export const access = unavailable;
export const constants = {};
export const createReadStream = unavailable;
export const createWriteStream = unavailable;
export const existsSync = (): boolean => false;
export const mkdtemp = unavailable;
export const open = unavailable;
export const readFile = unavailable;
export const readFileSync = unavailable;
export const readdir = unavailable;
export const rename = unavailable;
export const rm = unavailable;
export const stat = unavailable;
export const unlink = unavailable;
export const writeFile = unavailable;
