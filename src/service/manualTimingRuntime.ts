import type { EventCatalogState } from "../catalog/eventCatalog.js";
import { createMutationId } from "../model/ids.js";
import type {
  ManualCrossingAcknowledgement,
  ManualCrossingCommand,
} from "../model/manualCrossing.js";
import type { ManualCrossingOutboxPersistence } from "../persistence/manualCrossingOutboxPersistence.js";
import { EventCatalogService } from "./eventCatalogService.js";
import { ManualCrossingOutboxService } from "./manualCrossingOutboxService.js";

export const applyManualTimingCommand = (
  service: EventCatalogService,
  command: ManualCrossingCommand,
): Promise<EventCatalogState> => {
  switch (command.action) {
    case "record":
      return service.recordManualCrossing(command.crossing, {
        crossingId: command.crossingId,
        mutationId: command.mutationId,
      });
    case "correct":
      return service.correctManualCrossing(
        command.crossingId,
        command.crossing,
        command.mutationId,
      );
    case "reverse":
      return service.reverseManualCrossing(
        command.crossingId,
        command.reason,
        command.mutationId,
      );
    case "reconcile":
      if (!command.crossing.entrantId)
        return Promise.reject(new Error("Reconciliation requires an entrant."));
      return service.reconcileManualCrossing(
        command.crossingId,
        command.crossing.entrantId,
        command.crossing.participantId,
        command.mutationId,
      );
  }
};

export const createManualTimingOutbox = (
  service: EventCatalogService,
  persistence: ManualCrossingOutboxPersistence,
  onCatalog: (
    catalog: EventCatalogState,
    command: ManualCrossingCommand,
  ) => void,
  endpoint: string = "/api/v1/timing/manual-crossings",
): ManualCrossingOutboxService =>
  new ManualCrossingOutboxService(persistence, {
    applyLocal: (command: ManualCrossingCommand): Promise<void> =>
      applyManualTimingCommand(service, command).then(
        (catalog: EventCatalogState): void => onCatalog(catalog, command),
      ),
    deliver: (
      command: ManualCrossingCommand,
    ): Promise<ManualCrossingAcknowledgement> =>
      fetch(endpoint, {
        body: JSON.stringify(command),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      }).then(
        async (response: Response): Promise<ManualCrossingAcknowledgement> => {
          if (
            response.status >= 500 ||
            response.status === 401 ||
            response.status === 403
          )
            throw new Error(
              `Manual timing delivery unavailable (${response.status}). Sign in or retry when connected.`,
            );
          const acknowledgement: Partial<ManualCrossingAcknowledgement> =
            (await response.json()) as Partial<ManualCrossingAcknowledgement>;
          if (
            !["accepted", "already-accepted", "rejected", "conflict"].includes(
              acknowledgement.status || "",
            ) ||
            acknowledgement.crossingId !== command.crossingId ||
            acknowledgement.mutationId !== command.mutationId
          )
            throw new Error(
              "The timing server returned an invalid or mismatched acknowledgement.",
            );
          return {
            crossingId: command.crossingId,
            mutationId: command.mutationId,
            reason: acknowledgement.reason,
            status: acknowledgement.status!,
          };
        },
      ),
    hasMutation: (mutationId: string): boolean =>
      service.mutations.some((mutation): boolean => mutation.id === mutationId),
    onRejected: (command: ManualCrossingCommand): Promise<void> => {
      const current = service.catalog.manualCrossings?.find(
        (crossing): boolean => crossing.crossingId === command.crossingId,
      );
      if (
        !current ||
        current.reversed ||
        current.status !== "scored" ||
        current.lastMutationId !== command.mutationId
      )
        return Promise.resolve();
      const attention: ManualCrossingCommand = {
        ...command,
        action: "correct",
        crossing: { ...command.crossing, status: "needs-attention" },
        mutationId: createMutationId(
          `manual-timing-rejected:${command.mutationId}`,
        ),
      };
      return applyManualTimingCommand(service, attention).then(
        (catalog: EventCatalogState): void => onCatalog(catalog, attention),
      );
    },
  });
