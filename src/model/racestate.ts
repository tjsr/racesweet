import type { EventCategory } from "./eventcategory.ts";
import type { EventParticipant } from "./eventparticipant.ts";
import type { EventTeam } from "./eventteam.ts";
import type { TimeRecord } from "./timerecord.ts";

export interface RaceState {
  records: TimeRecord[];
  participants: EventParticipant[];
  categories: EventCategory[];
  teams: EventTeam[];
}

export class Session implements RaceState {
  private _records: TimeRecord[] = [];

  public get records(): TimeRecord[] {
    return this._records;
  }
  
  public get participants(): EventParticipant[] {
    return [];
  }
   
  public get categories(): EventCategory[] {
    return [];
  }

  public get teams(): EventTeam[] {
    return [];
  }  
}
