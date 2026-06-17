import { ApicalDataException } from "./apicalDataException.js";

export class ApicalRequestFailedError extends ApicalDataException {
    body?: string;
    constructor(phase: string, url: string, init: RequestInit, timeoutMs: number) {
        super(`Apical ${phase} request failed for URL: ${url}`);
        this.name = 'ApicalRequestFailedError';
        this.phase = phase;
        this.url = url;
        this.init = init;
        this.timeoutMs = timeoutMs;
    }

    phase: string;
    url: string;
    init: RequestInit;
    timeoutMs: number;
    cause?: unknown;
    status?: number;
}