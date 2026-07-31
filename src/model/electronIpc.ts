export const ReadContentIpcReceiveChannel = "sendReadContent";
export const ReadContentErrorIpcReceiveChannel = "sendReadError";
export const WriteContentIpcReceiveChannel = "sendWriteSuccess";
export const WriteContentErrorIpcReceiveChannel = "sendWriteError";

export const RequestReadIpcSendChannel = "askToRead";
export const RequestExternalHttpIpcInvokeChannel = "askToRequestExternalHttp";
export const RequestClearSavedLoginCredentialsIpcInvokeChannel =
  "askToClearSavedLoginCredentials";
export const RequestLoadSavedLoginCredentialsIpcInvokeChannel =
  "askToLoadSavedLoginCredentials";
export const RequestOpenLocalFileIpcInvokeChannel = "askToOpenLocalFile";
export const RequestOpenExternalUrlIpcInvokeChannel = "askToOpenExternalUrl";
export const RequestSaveLoginCredentialsIpcInvokeChannel =
  "askToSaveLoginCredentials";
export const RequestSelectLocalDirectoryIpcInvokeChannel =
  "askToSelectLocalDirectory";
export const RequestSelectLocalFileIpcInvokeChannel = "askToSelectLocalFile";
export const RequestWriteIpcSendChannel = "askToWrite";

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
  RequestClearSavedLoginCredentialsIpcInvokeChannel,
  RequestExternalHttpIpcInvokeChannel,
  RequestLoadSavedLoginCredentialsIpcInvokeChannel,
  RequestOpenLocalFileIpcInvokeChannel,
  RequestOpenExternalUrlIpcInvokeChannel,
  RequestSaveLoginCredentialsIpcInvokeChannel,
  RequestSelectLocalDirectoryIpcInvokeChannel,
  RequestSelectLocalFileIpcInvokeChannel,
];
