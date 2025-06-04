import { ParticipantStartFlagError, StartFlagHasNoTimeError } from "./errors.ts";

import type { GreenFlagRecord } from "../model/flag.ts";

export const validateStartFlag = (participantCategoryStartFlag: GreenFlagRecord | null | undefined): void => {
  if (!participantCategoryStartFlag) {
    throw new ParticipantStartFlagError('Participant category start flag is undefined.');
  }

  if (!participantCategoryStartFlag.time) {
    throw new StartFlagHasNoTimeError('Participant category start flag has no time.');
  }
};
