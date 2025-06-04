import type { ISO8601DateTime, IdType, WithId, uuid } from "./types.ts";

type MutationId = uuid;
interface TypeMutation<T extends WithId<IdType>> {
  type: 'create' | 'update' | 'delete';
  mutationId: MutationId;
  modificationTime: ISO8601DateTime;
  modifiedBy: string; // User ID or username
  automatedChange: boolean;
  data: T;
  previousData?: T; // Only for updates
}

export interface LedgerMutationType<T extends WithId<Id>, Id extends IdType> {
  mutations: TypeMutation<T>[];
}
