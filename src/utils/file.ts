import { FileHandle, open } from "fs/promises";
import type { PathLike, ReadStream } from "fs";

export const getFileStream = async (filePath: PathLike): Promise<ReadStream> => {
  const fileHandle: FileHandle = await open(filePath);
  const stream: ReadStream = fileHandle.createReadStream();
  stream.setEncoding('utf8');
  return stream;
};
