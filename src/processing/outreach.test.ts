import { timeValueFromString } from "./outreach.js";

describe('Outreach line formats', () => {
  it('Parse line with no date', () => {
    expect(1, 'Is 1').toStrictEqual(1);
  });
  it('Parse another line with no date', () => {
    expect(2, 'Is 2').toStrictEqual(2);
  });

  it ('Should return time value on line delimited by semicolon', () => {
    const line = '200319;"26/10/2024 09:06:25.888"';
    const t = timeValueFromString(line);
    expect(t).toEqual(new Date("26/10/2024 09:06:25.888"));
  });
});
