// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { useUiConsoleGuards } from "../testing/uiConsoleGuards.js";
import { SelectTextField } from "./selectTextField.js";

describe("SelectTextField", () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach((): void => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach((): void => {
    act((): void => {
      root.unmount();
    });
    container.remove();
  });

  it("always shrinks its label into the outlined border", async (): Promise<void> => {
    await act(async (): Promise<void> => {
      root.render(
        <SelectTextField label="Event" value="event-1">
          <option value="event-1">Winter Series</option>
        </SelectTextField>,
      );
    });

    const inputLabel: HTMLDivElement | null = container.querySelector(".MuiInputLabel-root");
    const outlineLegend: HTMLLegendElement | null = container.querySelector("fieldset legend");
    expect(inputLabel?.dataset.shrink).toBe("true");
    expect(outlineLegend?.textContent).toBe("Event");
  });
});
