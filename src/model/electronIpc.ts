export const ReadContentIpcReceiveChannel = 'sendReadContent';
export const ReadContentErrorIpcReceiveChannel = 'sendReadError';
export const WriteContentIpcReceiveChannel = 'sendWriteSuccess';
export const WriteContentErrorIpcReceiveChannel = 'sendWriteError';

export const RequestReadIpcSendChannel = 'askToRead';
export const RequestExternalHttpIpcInvokeChannel = 'askToRequestExternalHttp';
export const RequestOpenLocalFileIpcInvokeChannel = 'askToOpenLocalFile';
export const RequestOpenExternalUrlIpcInvokeChannel = 'askToOpenExternalUrl';
export const RequestSelectLocalDirectoryIpcInvokeChannel = 'askToSelectLocalDirectory';
export const RequestSelectLocalFileIpcInvokeChannel = 'askToSelectLocalFile';
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

export const VALID_INVOKE_CHANNELS = [
  RequestExternalHttpIpcInvokeChannel,
  RequestOpenLocalFileIpcInvokeChannel,
  RequestOpenExternalUrlIpcInvokeChannel,
  RequestSelectLocalDirectoryIpcInvokeChannel,
  RequestSelectLocalFileIpcInvokeChannel,
];

