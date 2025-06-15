export const ReadContentIpcReceiveChannel = 'sendReadContent';
export const ReadContentErrorIpcReceiveChannel = 'sendReadError';
export const WriteContentIpcReceiveChannel = 'sendWriteSuccess';
export const WriteContentErrorIpcReceiveChannel = 'sendWriteError';

export const RequestReadIpcSendChannel = 'askToRead';
export const RequestWriteIpcSendChannel = 'askToWrite';

export const VALID_RECEIVE_CHANNELS = [
  ReadContentIpcReceiveChannel,
  ReadContentErrorIpcReceiveChannel,
  WriteContentIpcReceiveChannel,
  WriteContentErrorIpcReceiveChannel,
];

export const VALID_SEND_CHANNELS = [
  RequestReadIpcSendChannel,
  RequestWriteIpcSendChannel,
];

