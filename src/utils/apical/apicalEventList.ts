export const COMPANY_GMBC = 2;

const getApicalEventListUrl = (companyId: number = COMPANY_GMBC, timestamp: number = Date.now()): string => `https://apicalracetiming.com.au/raceresult/event/getall?companyId=${companyId}&_=${timestamp}`;

export interface ApicalEventResponseEventData {
  Id: number;
  Name: string;
  EventDate: string;
  CompanyName: string;
  ThumbPathAndFileName: string;
}

export type  ApicalEventListResponse = ApicalEventResponseEventData[];

export const getApicalEventList = (companyId: number = COMPANY_GMBC, timestamp: number = Date.now()): Promise<ApicalEventListResponse> => {
  const url = getApicalEventListUrl(companyId, timestamp);
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch event list: ${response.statusText}`);
      }
      return response.json();
    })
    .then((data: ApicalEventListResponse) => {
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid event list response format');
      }
      return data;
    });
};

