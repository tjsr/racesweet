# AI Agent Instructions: State, API, and Data Mutation Architecture

This document defines the strict architectural rules for data flow, state management, validation, and database operations. AI agents must follow these guidelines exactly.

## 1. Project File Structure
All code related to data mutations must live in these exact directories. Do not create files outside of this structure.

*   `src/models/` - Type definitions and database schemas (e.g., `user.model.ts`).
*   `src/validation/` - Zod validation schemas for incoming API payloads.
*   `src/store/` - Central state management files and state slices.
*   `src/db/` - CRUD repositories and ledger entry handlers.
*   `src/api/` - API event handlers and route controllers.
*   `src/app/context/` - Application context views for main interaction panels.
*   `src/app/controls/` - Individual React UI components of which a context is made up.

## 2. Data Validation
All data entering the system from API events must undergo strict validation before triggering state changes or database writes.

*   **Tooling**: Use **Zod** for all runtime type validations.
*   **Rule**: Infer TypeScript types directly from the Zod schemas to ensure sync.
*   **Action**: Reject invalid payloads immediately at the API boundary with a descriptive error.

## 3. API Event Interactions & Data Mutation
API events must follow a unidirectional data flow. They should validate data, execute database transactions, and then update client state.

*   **Rule**: API routes must not handle business logic or raw DB queries directly.
*   **Flow**: API Event -> Validate Payload -> Execute DB Repository/Ledger -> Update State Store.

## 4. Data Store CRUD & Ledger Entries
Database interactions are split into standard CRUD operations and append-only ledger records.

*   **Standard CRUD**: Use isolated repository classes for basic Create, Read, Update, Delete tasks.
*   **Ledger Entries**: Ledger data is **append-only**. Never update or delete an existing ledger entry. 

---

## 5. Architectural Code Examples

### Data Validation & API Interaction (`src/api/` & `src/validation/`)
```typescript
import { z } from 'zod';

// 1. Define the validation schema
export const CreateSessionSchema = z.object({
  eventIdId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['race', 'practice', 'qualifying']),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

// 2. Handle the API event
export async function handleSessionEvent(req: Request, res: Response) {
  // Validate incoming data
  const result = CreateSessionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.format() });
  }

  // Pass validated data to the ledger and store layer
  const newEntry = await LedgerRepository.createEntry(result.data);
  return res.status(201).json(newEntry);
}
```

### CRUD & Ledger Operations (`src/db/`)
```typescript
import { db } from './connection';

export class LedgerRepository {
  /**
   * Appends a new ledger entry and updates account balance in a single transaction.
   */
  static async createEntry(data: CreateTransactionInput) {
    return await db.transaction(async (tx) => {
      // 1. Insert append-only entry into ledger
      const [ledgerEntry] = await tx.insert(ledgerTable).values({
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date(),
      }).returning();

      // 2. Update the session name (CRUD operation)
      await tx.update(sessionsTable)
        .set({ name: data.name })
        .where(eq(sessionsTable.id, data.eventId));

      return ledgerEntry;
    });
  }
}
```

### State Management (`src/store/`)
```typescript
import { createStore } from 'some-state-library';

// Keep state management pure and reactive to system events
export const useSessionStore = createStore((set) => ({
  sessions: {},
  updateSessionName: (sessionId: string, newName: string) => 
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: newName }
    })),
}));
```
