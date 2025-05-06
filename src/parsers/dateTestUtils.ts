export const expectDate = (date: Date, year: number, month: number, day: number) => {
  const valueYear = date.getFullYear();
  expect(valueYear, `Year ${valueYear} did not match expected year ${year}`).toEqual(year);
  const monthValue = date.getMonth() + 1;
  expect(monthValue, `Month ${monthValue} did not match expected month ${month}`).toEqual(month);
  const dayValue = date.getDate();
  expect(dayValue, `Day ${dayValue} did not match expected day ${day}`).toEqual(day);
};
