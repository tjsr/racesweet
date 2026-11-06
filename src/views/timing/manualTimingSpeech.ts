export interface TimingSpeechAdapter {
  available: boolean;
  listen: () => Promise<string>;
  stop: () => void;
}

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface TimingSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface TimingSpeechWindow {
  SpeechRecognition?: new () => TimingSpeechRecognition;
  webkitSpeechRecognition?: new () => TimingSpeechRecognition;
}

export const createTimingSpeechAdapter = (
  browser: TimingSpeechWindow = window as TimingSpeechWindow,
): TimingSpeechAdapter => {
  const Constructor: (new () => TimingSpeechRecognition) | undefined =
    browser.SpeechRecognition || browser.webkitSpeechRecognition;
  let recognition: TimingSpeechRecognition | undefined;
  return {
    available: !!Constructor,
    listen: (): Promise<string> =>
      new Promise(
        (
          resolve: (value: string) => void,
          reject: (error: Error) => void,
        ): void => {
          if (!Constructor) {
            reject(
              new Error(
                "Speech recognition is unavailable. Use keyboard or keypad entry.",
              ),
            );
            return;
          }
          recognition = new Constructor();
          recognition.continuous = false;
          recognition.interimResults = false;
          let completed: boolean = false;
          recognition.onresult = (event: {
            results: ArrayLike<SpeechResult>;
          }): void => {
            const transcript: string = Array.from(event.results)
              .filter((result: SpeechResult): boolean => result.isFinal)
              .map((result: SpeechResult): string => result[0].transcript)
              .join(" ");
            if (transcript) {
              completed = true;
              resolve(transcript);
            }
          };
          recognition.onerror = (event: { error: string }): void => {
            completed = true;
            reject(
              new Error(
                `Speech recognition: ${event.error}. Keyboard and keypad remain available.`,
              ),
            );
          };
          recognition.onend = (): void => {
            if (!completed)
              reject(
                new Error(
                  "No final speech was recognized. Try again or use keyboard entry.",
                ),
              );
          };
          recognition.start();
        },
      ),
    stop: (): void => recognition?.stop(),
  };
};
