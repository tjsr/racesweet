import type { ApicalEventListResponse } from '../../model/apical.ts';

export const COMPANY_GMBC = 2;

const getApicalEventListUrl = (companyId: number, timestamp: number): string =>
  `https://apicalracetiming.com.au/raceresult/event/getall?companyId=${companyId}&_=${timestamp}`;

export const getApicalEventList = (companyId: number = COMPANY_GMBC): Promise<ApicalEventListResponse> => {
  const url = getApicalEventListUrl(companyId, Date.now());
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch Apical event list: ${response.statusText}`);
      }
      return response.json() as Promise<ApicalEventListResponse>;
    })
    .then((data) => {
      if (!Array.isArray(data)) {
        throw new Error('Invalid Apical event list response: expected an array');
      }
      return data;
    });
};
