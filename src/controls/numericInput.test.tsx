// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { useUiConsoleGuards } from "../testing/uiConsoleGuards.js";
import { NumericInput } from "./numericInput.js";

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor: PropertyDescriptor | undefined =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("NumericInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("filters non-numeric characters and preserves values longer than its compact default width", async () => {
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <NumericInput
          ariaLabel="Race plate"
          label="Race plate"
          onChange={onChange}
          value=""
        />,
      );
    });

    const input: HTMLInputElement = container.querySelector(
      'input[aria-label="Race plate"]',
    ) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");

    await act(async () => {
      setInputValue(input, "12a34-567890");
    });

    expect(onChange).toHaveBeenCalledWith("1234567890");
  });
});
