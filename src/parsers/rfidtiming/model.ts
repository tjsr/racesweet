import type { ChipCrossingData } from "../../model";

export interface RFIDTimingChipCrossingData extends ChipCrossingData {
  antenna: number | undefined;
}
