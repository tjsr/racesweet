import { act } from 'react';

/** Drive the visible MUI popup rather than a hidden testing-only native select. */
export const chooseMuiOption = async (control: HTMLElement, text: string): Promise<void> => {
  await act(async (): Promise<void> => {
    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  const option: HTMLElement | undefined = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((candidate: HTMLElement): boolean => candidate.textContent === text);
  if (!option) throw new Error(`MUI option was not found: ${text}`);
  await act(async (): Promise<void> => option.click());
};
