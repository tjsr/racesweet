// Formats present
// 3,200319,200319,"26/10/2024 09:06:25.888"
// 2,200501,200501,"09:03:48.510"
// 1,200440,200440,"17/08/2024 10:30:33.735",1,1
// 200373	2025-03-01 11:11:45.451

const simpleTabPattern: RegExp = /(?<chipCode>\d)\t"?(?<time>)"?/;

const timeValueFromString = (value: string, dateHint: Date | undefined = new Date()): Date => {
  const epoch: number = Date.parse(value);
  return new Date(epoch);
  // constructFrom(dateHint) 
};
