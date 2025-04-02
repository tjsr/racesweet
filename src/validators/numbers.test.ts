import { validatePositiveNumbers } from "./numbers.ts";

describe("validatePositiveNumbers", () => {
  it("should not throw an error for valid positive numbers", () => {
    expect(() => validatePositiveNumbers("1", "42", "100")).not.toThrow();
  });

  it("should throw an error for non-numeric strings", () => {
    expect(() => validatePositiveNumbers("abc", "42", "100")).toThrow(
      "Invalid value: abc"
    );
  });

  it("should throw an error for negative numbers", () => {
    expect(() => validatePositiveNumbers("-1", "42", "100")).toThrow(
      "Invalid value: -1"
    );
  });

  it("should throw an error for zero", () => {
    expect(() => validatePositiveNumbers("0", "42", "100")).toThrow(
      "Invalid value: 0"
    );
  });

  it("should throw an error for empty strings", () => {
    expect(() => validatePositiveNumbers("", "42", "100")).toThrow(
      "Invalid value: "
    );
  });

  it("should throw an error for mixed invalid and valid inputs", () => {
    expect(() => validatePositiveNumbers("1", "-2", "abc")).toThrow(
      "Invalid value: -2"
    );
  });

  it("should handle a single valid input", () => {
    expect(() => validatePositiveNumbers("10")).not.toThrow();
  });

  it("should throw an error for a single invalid input", () => {
    expect(() => validatePositiveNumbers("-10")).toThrow(
      "Invalid value: -10"
    );
  });
});