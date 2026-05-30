// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';

vi.mock('../views/display/categories', () => ({
  CategoryList: () => React.createElement('div', null, 'Category List'),
}));

vi.mock('../views/display/recent', () => ({
  RecentRecords: () => React.createElement('div', null, 'Recent Records'),
}));

import { RaceSweetMainApp } from './app.js';

const readFixtureBuffer = async (filePath: string): Promise<Buffer> => {
  const fileName = path.basename(filePath);
  const fixturePath = path.join(process.cwd(), 'src', 'testdata', fileName);
  return readFile(fixturePath);
};

const readGeneratedFixture = async (filePath: string): Promise<string> => {
  if (filePath.includes('event-catalog.json')) {
    return JSON.stringify({ mutations: [], schemaVersion: 1 });
  }

  if (filePath.includes('system-config.json')) {
    return JSON.stringify({
      dataSources: [],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {},
    });
  }

  if (filePath.includes('admin-overrides.json')) {
    return JSON.stringify({ entrantCategories: {}, excludedCrossings: {}, schemaVersion: 1 });
  }

  throw new Error(`Unknown generated file requested: ${filePath}`);
};

const clickSectionButton = async (container: HTMLDivElement, sectionName: string): Promise<void> => {
  const sectionButton = container.querySelector(`button[aria-label="${sectionName}"]`) as HTMLButtonElement | null;
  expect(sectionButton).toBeTruthy();

  await act(async () => {
    sectionButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const waitForLoadedApp = async (container: HTMLDivElement): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!container.textContent?.includes('Loading...')) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error('Timed out waiting for RaceSweetMainApp to load');
};

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const clickButtonByText = async (container: HTMLDivElement, label: string): Promise<void> => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
  expect(button).toBeTruthy();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const waitForText = async (container: HTMLDivElement, text: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for text: ${text}`);
};

const waitForInputValue = async (container: HTMLDivElement, selector: string, value: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const input = container.querySelector(selector) as HTMLInputElement | null;
    if (input && input.value === value) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for input value: ${selector}=${value}`);
};

const waitForTextNotPresent = async (container: HTMLDivElement, text: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for text to disappear: ${text}`);
};

describe('RaceSweetMainApp integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      return readGeneratedFixture(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders each main panel with key controls visible', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Add Apical Data file');
    expect(container.textContent).toContain('Apply Assigned Sources To Session');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Event Details');
    expect(container.textContent).toContain('Session Summary');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    expect(container.textContent).toContain('Create Entrant');
    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.textContent).toContain('Create Category');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    expect(container.textContent).toContain('Create Session');
    expect(container.querySelector('input[aria-label="Sessions Page Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Timing');
    expect(container.querySelector('h1')?.textContent).toBe('Timing');
    expect(container.textContent).toContain('Recent Records');
    expect(container.textContent).toContain('Handicap Data');

    await clickSectionButton(container, 'Results');
    expect(container.querySelector('h1')?.textContent).toBe('Results');
    expect(container.textContent).toContain('Results Tools');

    await clickSectionButton(container, 'Reports');
    expect(container.querySelector('h1')?.textContent).toBe('Reports');
    expect(container.textContent).toContain('Reports Tools');
  });

  it('keeps panel rendering healthy after edits and panel switches', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'Entrants');
    const entrantNameInput = container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement;
    expect(entrantNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(entrantNameInput, 'Renderer Regression Entrant');
    });

    await clickButtonByText(container, 'Save Entrant');
    await waitForInputValue(container, 'input[aria-label="Entrant Name"]', 'Renderer Regression Entrant');

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    const sessionNameInput = container.querySelector('input[aria-label="Sessions Page Name"]') as HTMLInputElement;
    expect(sessionNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(sessionNameInput, 'Renderer Regression Session');
    });

    await clickButtonByText(container, 'Save Session');
    await waitForInputValue(container, 'input[aria-label="Sessions Page Name"]', 'Renderer Regression Session');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Event Details');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Apply Assigned Sources To Session');

    await clickSectionButton(container, 'Timing');
    expect(container.querySelector('h1')?.textContent).toBe('Timing');
    expect(container.textContent).toContain('Recent Records');

    await clickSectionButton(container, 'Reports');
    expect(container.querySelector('h1')?.textContent).toBe('Reports');
    expect(container.textContent).toContain('Reports Tools');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    await waitForInputValue(container, 'input[aria-label="Entrant Name"]', 'Renderer Regression Entrant');

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    await waitForInputValue(container, 'input[aria-label="Sessions Page Name"]', 'Renderer Regression Session');
  });

  it('supports create and delete operations and still renders correctly after panel switches', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'Entrants');
    await clickButtonByText(container, 'Create Entrant');
    await waitForText(container, 'New Entrant');

    await clickButtonByText(container, 'Delete Entrant');
    await waitForTextNotPresent(container, 'New Entrant');

    await clickSectionButton(container, 'Sessions');
    await clickButtonByText(container, 'Create Session');
    await waitForText(container, 'New Session');

    await clickButtonByText(container, 'Delete Session');
    await waitForTextNotPresent(container, 'New Session');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Session Summary');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Apply Assigned Sources To Session');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    expect(container.querySelector('input[aria-label="Sessions Page Name"]')).toBeTruthy();
  });
});
