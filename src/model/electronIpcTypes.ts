import {
  ReadContentErrorIpcReceiveChannel,
  ReadContentIpcReceiveChannel,
  RequestReadIpcSendChannel,
  RequestWriteIpcSendChannel,
  WriteContentErrorIpcReceiveChannel,
  WriteContentIpcReceiveChannel
} from "./electronIpc.ts";

export class InvalidIpcChannelError extends Error {
  constructor(channel: string) {
    super(`Invalid IPC channel: ${channel}`);
    this.name = "InvalidIpcChannelError";
  }
}

export type SendChannels =
  typeof RequestReadIpcSendChannel |
  typeof RequestWriteIpcSendChannel;

export type ReceiveChannels =
  typeof ReadContentIpcReceiveChannel |
  typeof ReadContentErrorIpcReceiveChannel |
  typeof WriteContentIpcReceiveChannel |
  typeof WriteContentErrorIpcReceiveChannel;
