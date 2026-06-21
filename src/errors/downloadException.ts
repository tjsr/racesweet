import { RaceSweetException } from "./raceSweetException.js";

export class DownloadException extends RaceSweetException {
    constructor(message: string, cause?: unknown) {
        super(message, { cause: cause });
    }
}