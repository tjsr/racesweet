/**
 * ATTENTION. This code was AUTO GENERATED by ts2typebox. While I don't know
 * your use case, there is a high chance that direct changes to this file get
 * lost. Consider making changes to the underlying Typescript code you use to
 * generate this file instead. The default file is called "types.ts", perhaps
 * have a look there! :]
 */

import { Type, Static } from "@sinclair/typebox";

export type RaceState = Static<typeof RaceState>;
export const RaceState = Type.Object({
  participants: Type.Array(EventParticipant),
  categories: Type.Array(EventCategory),
  teams: Type.Array(EventTeam),
});
