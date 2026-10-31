import { randomUUID } from "node:crypto";

import { parseManualCrossingSubmission } from "./manualCrossingRequest.js";

const validSubmission: object = {
  crossing: {
    eventId: "event-1",
    identifierKind: "transmitter",
    identifierValue: "A-42",
    lineNumber: 1,
    localDate: "2026-01-01",
    localTime: "12:00:00",
    sessionId: "session-1",
    status: "needs-attention",
    time: "2026-01-01T12:00:00.000Z",
    timeZone: "UTC",
  },
  crossingId: randomUUID(),
  mutationId: randomUUID(),
};

describe("parseManualCrossingSubmission", () => {
  it("accepts a complete submission and preserves stable IDs", () => {
    expect(parseManualCrossingSubmission(validSubmission)).toEqual(
      validSubmission,
    );
  });

  it("rejects missing IDs, context, and malformed fields", () => {
    expect(() => parseManualCrossingSubmission(null)).toThrow();
    expect(() =>
      parseManualCrossingSubmission({ ...validSubmission, mutationId: "" }),
    ).toThrow();
    expect(() =>
      parseManualCrossingSubmission({
        ...validSubmission,
        crossing: {
          ...(validSubmission as { crossing: object }).crossing,
          lineNumber: "one",
        },
      }),
    ).toThrow();
    expect(() =>
      parseManualCrossingSubmission({
        ...validSubmission,
        crossing: {
          ...(validSubmission as { crossing: object }).crossing,
          status: "accepted",
        },
      }),
    ).toThrow();
  });
});
