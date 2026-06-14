export const APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

export const getApicalExcelDownloadUrl = (baseUrl: string, fileGuid: string, fileName: string): string => {
  return `${baseUrl.replace(/\/$/, '')}/Download/DownloadExcel?fileGuid=${fileGuid}&filename=${encodeURIComponent(fileName)}`;
};

export const createApicalExcelDownloadHeaders = (baseUrl: string, eventId: number, cookie: string): Headers => {
  const headers = new Headers();
  headers.set('Accept', APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER);
  headers.set('Accept-Encoding', 'gzip, deflate, br, zstd');
  headers.set('Cache-Control', 'max-age=0');
  headers.set('Cookie', cookie);
  headers.set('Referrer', `${baseUrl.replace(/\/$/, '')}/raceresult/event/detail?id=${eventId}`);
  headers.set('Sec-Fetch-Dest', 'document');
  headers.set('Sec-Fetch-Mode', 'navigate');
  headers.set('Sec-Fetch-Site', 'none');
  headers.set('Sec-Fetch-User', '?1');
  headers.set('Upgrade-Insecure-Requests', '1');
  return headers;
};
