import { fixDateInDateTimeString } from "./datetime.ts";

describe('Date', () => {
  it('Should parse a basic date format as a valid date.', () => {
    // const date = new Date('23/08/2024 18:45:34.177');

    // const epoch = Date.parse('23/08/2024 18:45:34.177');
    let epoch = Date.parse('2024-08-23 18:45:34.177');
    // epoch = Date.parse('2024/08/23 18:45:34.177');
    epoch = Date.parse(fixDateInDateTimeString('23/08/2024 18:45:34.177'));
    const date = new Date(epoch);
    expect(date.getTime()).toBe(1724402734177);
  });
});

