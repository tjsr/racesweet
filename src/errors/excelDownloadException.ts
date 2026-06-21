import { DownloadException } from "./downloadException.js";

export class ExcelDownloadException extends DownloadException {
    constructor(message: string, cause?: unknown) {
        super(message, cause);
    }
}