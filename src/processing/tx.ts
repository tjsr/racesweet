import { AutomaticTimingIdentifiactionCrossing } from "../model/tx";

export const getIdentifier = <Node extends string>(crossing: AutomaticTimingIdentifiactionCrossing<Node>, node: string): number => {
  return crossing[node as keyof AutomaticTimingIdentifiactionCrossing<Node>] as number;
};
