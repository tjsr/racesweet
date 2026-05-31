import { ReadStream } from "fs";

export const closeStream = async (
  stream: ReadStream
): Promise<void> => new Promise((resolve, reject) => {
  stream.close((err) => {
    if (err) {
      reject(err);
    }
    resolve();
  });
});

