import { fixDateInDateTimeString } from "./datetime.js";

describe('Date', () => {
  it('Should parse a basic date format as a valid date.', () => {
    const epoch = Date.parse(fixDateInDateTimeString('23/08/2024 18:45:34.177'));
    const date = new Date(epoch);
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(23);
    expect(date.getHours()).toBe(18);
    expect(date.getMinutes()).toBe(45);
    expect(date.getSeconds()).toBe(34);
    expect(date.getMilliseconds()).toBe(177);
  });
});

