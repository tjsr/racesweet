// @vitest-environment jsdom

import { type Root, createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { EntrantsPage } from './entrantsPage.js';
import { type EventCatalogEntry, type EventCatalogState } from '../../catalog/eventCatalog.js';
import { type EventCatalogLedger, applyEventCatalogLedger, createDefaultEventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import { type EventParticipant } from '../../model/eventparticipant.js';
import { type RaceState } from '../../model/racestate.js';
import React from 'react';
import { act } from 'react';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const blurInput = (input: HTMLInputElement | HTMLTextAreaElement): void => {
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const getPanelByHeading = (container: HTMLElement, headingText: string): HTMLElement => {
  const heading = Array.from(container.querySelectorAll('h2')).find((item) => item.textContent === headingText);
  const panel = heading?.closest('section');
  if (!panel) {
    throw new Error(`Panel ${headingText} was not rendered.`);
  }

  return panel as HTMLElement;
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  categories: [
    {
      eventId: 'event-1',
      id: 'cat-1',
      name: 'Premier',
      teamRules: { teamCompositionRules: [] },
    },
    {
      eventId: 'event-2',
      id: 'cat-2',
      name: 'Teams',
      teamRules: { maxTeamSize: 2, teamCompositionRules: [] },
    },
    {
      eventId: 'event-2',
      id: 'cat-pro',
      name: 'Pro',
      teamRules: { teamCompositionRules: [] },
    },
  ],
  deletedEventIds: [],
  entrants: [
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Empty',
      id: 'ent-empty',
      lastName: 'Rider',
      memberParticipantIds: ['ent-empty'],
      name: 'Empty Rider',
      sessionIds: ['session-1'],
    },
    {
      categoryId: 'cat-1',
      categoryIds: ['cat-1'],
      dateOfBirth: '2000-01-02',
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Pat',
      gender: 'female',
      id: 'ent-1',
      lastName: 'Rider',
      memberParticipantIds: ['p-1'],
      name: 'Pat Rider',
      sessionIds: ['session-1'],
    },
    {
      categoryIds: ['cat-2'],
      entrantType: 'team',
      eventId: 'event-2',
      id: 'ent-2',
      memberParticipantIds: ['p-2', 'p-3'],
      name: 'Team Blue',
      sessionIds: ['session-2'],
      teamMembers: [
        {
          categoryId: 'cat-2',
          firstName: 'Blue',
          lastName: 'One',
          participantId: 'p-2',
        },
        {
          categoryId: 'cat-2',
          firstName: 'Blue',
          lastName: 'Two',
          participantId: 'p-3',
        },
      ],
    },
    {
      categoryId: 'cat-2',
      categoryIds: ['cat-2'],
      entrantType: 'rider',
      eventId: 'event-2',
      firstName: 'Blue',
      id: 'p-2',
      lastName: 'One',
      memberParticipantIds: ['p-2'],
      name: 'Blue One',
      sessionIds: ['session-2'],
      teamEntrantId: 'ent-2',
    },
    {
      categoryId: 'cat-pro',
      categoryIds: ['cat-pro'],
      entrantType: 'rider',
      eventId: 'event-2',
      firstName: 'Blue',
      id: 'ent-blue-two',
      lastName: 'Two',
      memberParticipantIds: [],
      name: 'Blue Two',
      sessionIds: ['session-2'],
      teamEntrantId: 'ent-2',
    },
    {
      categoryIds: [],
      entrantType: 'rider',
      eventId: 'event-2',
      firstName: 'No',
      id: 'ent-unassigned',
      lastName: 'Category',
      memberParticipantIds: ['ent-unassigned'],
      name: 'No Category',
      sessionIds: ['session-2'],
    },
  ],
  events: [
    {
      categoryIds: ['cat-1'],
      date: '2026-06-12',
      entrantIds: ['ent-empty', 'ent-1'],
      format: 'race-weekend',
      id: 'event-1',
      name: 'Winter Round',
      sessionIds: ['session-1', 'session-1-practice'],
    },
    {
      categoryIds: ['cat-2', 'cat-pro'],
      date: '2026-07-10',
      entrantIds: ['ent-2'],
      format: 'test-day',
      id: 'event-2',
      name: 'Spring Test',
      sessionIds: ['session-2'],
    },
  ],
  sessions: [
    {
      categoryIds: ['cat-1'],
      eventId: 'event-1',
      id: 'session-1',
      kind: 'race',
      name: 'Premier Race',
      scheduledStart: '2026-06-12T09:00:00.000Z',
      status: 'scheduled',
    },
    {
      categoryIds: [],
      eventId: 'event-1',
      id: 'session-1-practice',
      kind: 'practice',
      name: 'Practice',
      scheduledStart: '2026-06-12T08:00:00.000Z',
      status: 'scheduled',
    },
    {
      categoryIds: ['cat-2', 'cat-pro'],
      eventId: 'event-2',
      id: 'session-2',
      kind: 'race',
      name: 'Teams Race',
      scheduledStart: '2026-07-10T09:00:00.000Z',
      status: 'scheduled',
    },
  ],
};

const raceState: Partial<RaceState> = {
  categories: [],
  participants: [
    {
      categoryId: 'cat-1',
      currentResult: undefined,
      entrantId: 'ent-empty',
      firstname: 'Empty',
      id: 'ent-empty',
      identifiers: [],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    },
    {
      categoryId: 'cat-1',
      currentResult: undefined,
      entrantId: 'ent-1',
      firstname: 'Pat',
      id: 'ent-1',
      identifiers: [
        { fromTime: undefined, racePlate: '73', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: '1234' },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    },
    {
      categoryId: 'cat-2',
      currentResult: undefined,
      entrantId: 'ent-2',
      firstname: 'Blue',
      id: 'p-2',
      identifiers: [
        { fromTime: undefined, racePlate: '201', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: '9201' },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'One',
    },
    {
      categoryId: 'cat-pro',
      currentResult: undefined,
      entrantId: 'ent-2',
      firstname: 'Blue',
      id: 'p-3',
      identifiers: [
        { fromTime: undefined, racePlate: '302', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: '9302' },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Two',
    },
  ],
  records: [],
  teams: [],
};

describe('EntrantsPage integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('defaults to active event, allows event switching, and saves entrant edits', async () => {
    const onCreateEntrant = vi.fn();
    const onDeleteEntrant = vi.fn();
    const onUpdateEntrant = vi.fn();

    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>(catalog.activeEventId);
      const [selectedEntrantId, setSelectedEntrantId] = React.useState<string | undefined>('ent-1');

      return (
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={setSelectedEntrantId}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedEntrantId(catalog.entrants.find((entrant) => entrant.eventId === eventId)?.id);
          }}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEventId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    const eventSelect = container.querySelector('select[aria-label="Entrants Event"]') as HTMLSelectElement;
    expect(eventSelect.value).toBe('event-1');
    expect(container.textContent).toContain('Pat Rider');
    let sessionsForEntrantPanel = getPanelByHeading(container, 'Sessions for Entrant');
    expect(sessionsForEntrantPanel.textContent).toContain('Premier Race');
    expect(sessionsForEntrantPanel.textContent).not.toContain('Practice');
    const entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).not.toContain('ent-1');
    expect(entrantList?.querySelector('.entrant-list-type')?.textContent).toBe('driver');

    await act(async () => {
      eventSelect.value = 'event-2';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Team Blue');
    sessionsForEntrantPanel = getPanelByHeading(container, 'Sessions for Entrant');
    expect(sessionsForEntrantPanel.textContent).toContain('Teams Race');
    expect(sessionsForEntrantPanel.textContent).not.toContain('Premier Race');
    const switchedEntrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(switchedEntrantList?.textContent).toContain('Individual Drivers');
    expect(switchedEntrantList?.textContent).toContain('Teams');
    expect(switchedEntrantList?.textContent).toContain('Blue One');
    expect(switchedEntrantList?.textContent).toContain('Team: Team Blue');
    expect(switchedEntrantList?.textContent?.indexOf('Individual Drivers')).toBeLessThan(switchedEntrantList?.textContent?.indexOf('Teams') ?? 0);
    expect(switchedEntrantList?.textContent?.indexOf('Blue One')).toBeLessThan(switchedEntrantList?.textContent?.indexOf('Team Blue') ?? 0);

    const categoryFilter = container.querySelector('select[aria-label="Entrants Category"]') as HTMLSelectElement;
    expect(Array.from(categoryFilter.options).map((option) => option.textContent)).toEqual(['All', 'Unassigned', 'Teams', 'Pro']);

    await act(async () => {
      setSelectValue(categoryFilter, 'cat-2');
    });

    expect(switchedEntrantList?.textContent).toContain('Team Blue');
    expect(switchedEntrantList?.textContent).toContain('Blue One');
    expect(switchedEntrantList?.textContent).not.toContain('Blue Two');
    expect(switchedEntrantList?.textContent).not.toContain('No Category');

    await act(async () => {
      setSelectValue(categoryFilter, 'cat-pro');
    });

    expect(switchedEntrantList?.textContent).toContain('Blue Two');
    expect(switchedEntrantList?.textContent).not.toContain('Blue One');
    expect(Array.from(switchedEntrantList?.querySelectorAll('button') || []).map((button) => button.querySelector('strong')?.textContent)).toEqual(['Blue Two']);

    await act(async () => {
      setSelectValue(categoryFilter, 'unassigned');
    });

    expect(switchedEntrantList?.textContent).toContain('No Category');
    expect(Array.from(switchedEntrantList?.querySelectorAll('button') || []).map((button) => button.querySelector('strong')?.textContent)).toEqual(['No Category']);

    await act(async () => {
      setSelectValue(categoryFilter, 'all');
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Driver');
    expect(createButton).toBeDefined();

    await act(async () => {
      createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCreateEntrant).toHaveBeenCalledWith('event-2', 'rider');

    const entrantNameInput = container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(entrantNameInput, 'Team Azure');
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-2', expect.objectContaining({ name: 'Team Azure' }));

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete Entrant');
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDeleteEntrant).toHaveBeenCalledWith('event-2', 'ent-2');
  });

  it('edits rider profile fields and updates team composition payloads', async () => {
    const onCreateEntrant = vi.fn();
    const onDeleteEntrant = vi.fn();
    const onSelectEntrant = vi.fn();
    const onSelectEvent = vi.fn();
    const onUpdateEntrant = vi.fn();
    const motorsportCatalog: EventCatalogState = {
      ...catalog,
      events: catalog.events.map((event) => event.id === 'event-1' ? { ...event, discipline: 'motorsport' } : event),
    };

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={motorsportCatalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={onSelectEntrant}
          onSelectEvent={onSelectEvent}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId="ent-1"
          selectedEventId="event-1"
        />,
      );
    });

    const firstNameInput = container.querySelector('input[aria-label="Entrant First Name"]') as HTMLInputElement;
    const surnameInput = container.querySelector('input[aria-label="Entrant Surname"]') as HTMLInputElement;
    const genderInput = container.querySelector('select[aria-label="Entrant Gender"]') as HTMLSelectElement;
    const dobInput = container.querySelector('input[aria-label="Entrant Date Of Birth"]') as HTMLInputElement;
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');

    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Entrant Start Order"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Entrant Vehicle"]')).toBeNull();
    expect(container.querySelector('select[aria-label="Entrant Category"]')).toBeNull();

    await act(async () => {
      setInputValue(firstNameInput, 'Jordan');
      setInputValue(surnameInput, 'Taylor');
      setSelectValue(genderInput, 'female');
      setInputValue(dobInput, '1998-12-24');
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-1', expect.objectContaining({
      dateOfBirth: '1998-12-24',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Taylor',
      name: 'Jordan Taylor',
    }));

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={onCreateEntrant}
          onDeleteEntrant={onDeleteEntrant}
          onSelectEntrant={onSelectEntrant}
          onSelectEvent={onSelectEvent}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId="ent-2"
          selectedEventId="event-2"
        />,
      );
    });

    const teamCategoryInput = container.querySelector('select[aria-label="Entrant Category"]') as HTMLSelectElement;
    const teamSaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');
    expect(container.textContent).toContain('Team Members');
    expect(container.querySelector('textarea[aria-label="Entrant Team Members"]')).toBeNull();

    await act(async () => {
      setSelectValue(teamCategoryInput, 'cat-pro');
      teamSaveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenLastCalledWith('ent-2', expect.objectContaining({
      categoryId: 'cat-pro',
    }));
  });

  it('shows imported Entry owners and their linked Drivers in the Entry category', async () => {
    const importedCatalog: EventCatalogState = {
      ...catalog,
      entrants: [
        ...catalog.entrants,
        {
          categoryIds: ['cat-1'],
          entrantType: 'team',
          entryIds: ['entry-mears'],
          eventId: 'event-1',
          id: 'entrant-penske',
          isEntryOwner: true,
          memberParticipantIds: ['participant-mears'],
          name: 'Penske Racing',
        },
        {
          categoryIds: [],
          entrantType: 'rider',
          eventId: 'event-1',
          firstName: 'Rick',
          id: 'driver-mears',
          lastName: 'Mears',
          memberParticipantIds: ['participant-mears'],
          name: 'Rick Mears',
        },
      ],
      entries: [
        {
          categoryId: 'cat-1',
          entrantId: 'entrant-penske',
          eventId: 'event-1',
          id: 'entry-mears',
          identifiers: [{ fromTime: undefined, toTime: undefined, txNo: '98' }] as unknown as EventCatalogEntry['identifiers'],
          name: 'Rick Mears',
          participantIds: ['participant-mears'],
          raceNumber: '3',
        },
      ],
      events: catalog.events.map((event) => event.id === 'event-1'
        ? {
          ...event,
          discipline: 'motorsport' as const,
          entrantIds: [...event.entrantIds, 'entrant-penske', 'driver-mears'],
          entryIds: ['entry-mears'],
        }
        : event),
    };
    const importedRaceState: Partial<RaceState> = {
      categories: [],
      entries: importedCatalog.entries,
      participants: [
        {
          categoryId: undefined,
          currentResult: undefined,
          entrantId: 'entrant-penske',
          entryId: 'entry-mears',
          firstname: 'Rick',
          id: 'participant-mears',
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Mears',
        },
      ],
      records: [],
      teams: [],
    };

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={importedCatalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          raceState={importedRaceState}
          selectedEntrantId="driver-mears"
          selectedEventId="event-1"
        />,
      );
    });

    const categoryFilter = container.querySelector('select[aria-label="Entrants Category"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(categoryFilter, 'cat-1');
    });

    const entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).toContain('Penske Racing');
    expect(entrantList?.textContent).toContain('Rick MEARS');
    expect(entrantList?.querySelector('.entrant-entry-chip')?.textContent).toBe('#3 Rick MEARS (Tx98)');
    expect(Array.from(entrantList?.querySelectorAll('strong') || []).map((item) => item.textContent)).not.toContain('Rick Mears');
    const entrantSelect = container.querySelector('select[aria-label="Driver Entrant"]') as HTMLSelectElement;
    expect(entrantSelect.value).toBe('entrant-penske');
    expect(entrantSelect.disabled).toBe(true);
    expect(entrantSelect.selectedOptions[0]?.textContent).toBe('Penske Racing (entran)');
    expect(container.textContent).toContain('Entrant: Penske Racing');
  });

  it('renders and edits each motorsport Entry and its Driver independently', async () => {
    const onUpdateEntrant = vi.fn();
    const onUpdateEntry = vi.fn();
    const entryCatalog: EventCatalogState = {
      ...catalog,
      entrants: [
        ...catalog.entrants,
        {
          categoryIds: ['cat-1'],
          entrantType: 'team',
          entryIds: ['entry-3', 'entry-5'],
          eventId: 'event-1',
          id: 'entrant-penske-two-cars',
          isEntryOwner: true,
          memberParticipantIds: ['participant-3', 'participant-5'],
          name: 'Penske Racing',
        },
        {
          categoryIds: [],
          entrantType: 'rider',
          eventId: 'event-1',
          firstName: 'Rick',
          id: 'driver-3',
          lastName: 'Mears',
          memberParticipantIds: ['participant-3'],
          name: 'Rick Mears',
        },
        {
          categoryIds: [],
          entrantType: 'rider',
          eventId: 'event-1',
          firstName: 'Emerson',
          id: 'driver-5',
          lastName: 'Fittipaldi',
          memberParticipantIds: ['participant-5'],
          name: 'Emerson Fittipaldi',
        },
      ],
      entries: [
        {
          categoryId: 'cat-1',
          entrantId: 'entrant-penske-two-cars',
          eventId: 'event-1',
          id: 'entry-3',
          identifiers: [],
          name: 'Rick Mears',
          participantIds: ['participant-3'],
          raceNumber: '3',
          startOrder: 1,
          vehicle: 'Penske PC-18',
        },
        {
          categoryId: 'cat-1',
          entrantId: 'entrant-penske-two-cars',
          eventId: 'event-1',
          id: 'entry-5',
          identifiers: [],
          name: 'Emerson Fittipaldi',
          participantIds: ['participant-5'],
          raceNumber: '5',
          startOrder: 3,
          vehicle: 'Penske PC-18B',
        },
      ],
      events: catalog.events.map((event) => event.id === 'event-1' ? {
        ...event,
        discipline: 'motorsport' as const,
        entrantIds: [...event.entrantIds, 'entrant-penske-two-cars', 'driver-3', 'driver-5'],
        entryIds: ['entry-3', 'entry-5'],
      } : event),
    };
    const participants: EventParticipant[] = [
      {
        categoryId: undefined,
        currentResult: undefined,
        entrantId: 'entrant-penske-two-cars',
        entryId: 'entry-3',
        firstname: 'Rick',
        id: 'participant-3',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Mears',
      },
      {
        categoryId: undefined,
        currentResult: undefined,
        entrantId: 'entrant-penske-two-cars',
        entryId: 'entry-5',
        firstname: 'Emerson',
        id: 'participant-5',
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Fittipaldi',
      },
    ];

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={entryCatalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={onUpdateEntrant}
          onUpdateEntry={onUpdateEntry}
          raceState={{ categories: [], participants, records: [], teams: [] }}
          selectedEntrantId="entrant-penske-two-cars"
          selectedEventId="event-1"
        />,
      );
    });

    expect(container.querySelectorAll('.entrant-entry-form')).toHaveLength(2);
    expect((container.querySelector('input[aria-label="Entry Vehicle entry-3"]') as HTMLInputElement).value).toBe('Penske PC-18');
    const secondVehicle = container.querySelector('input[aria-label="Entry Vehicle entry-5"]') as HTMLInputElement;
    const secondStartOrder = container.querySelector('input[aria-label="Entry Start Order entry-5"]') as HTMLInputElement;
    expect(secondVehicle.value).toBe('Penske PC-18B');
    expect(secondStartOrder.value).toBe('3');
    expect(container.querySelector('input[aria-label="Entry Driver First Name driver-3"]')).toBeTruthy();
    const secondDriverSurname = container.querySelector('input[aria-label="Entry Driver Surname driver-5"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(secondVehicle, 'Penske PC-19');
      setInputValue(secondStartOrder, '7');
      Array.from(secondVehicle.closest('fieldset')!.querySelectorAll('button')).find((button) => button.textContent === 'Save Entry')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setInputValue(secondDriverSurname, 'Fittipaldi Jr');
      Array.from(secondDriverSurname.closest('fieldset')!.querySelectorAll('button')).find((button) => button.textContent === 'Save Driver')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntry).toHaveBeenCalledWith('entry-5', expect.objectContaining({
      categoryId: 'cat-1',
      raceNumber: '5',
      startOrder: 7,
      vehicle: 'Penske PC-19',
    }));
    expect(onUpdateEntrant).toHaveBeenCalledWith('driver-5', expect.objectContaining({
      firstName: 'Emerson',
      lastName: 'Fittipaldi Jr',
      name: 'Emerson Fittipaldi Jr',
    }));
  });

  it('loads an entrant spreadsheet beside the event selector and forwards detected records', async () => {
    let completeImport: (() => void) | undefined;
    const onImportEntrants = vi.fn(() => new Promise<void>((resolve) => {
      completeImport = resolve;
    }));
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Tx', 'Grid', 'Car Num.', 'Driver', 'Entrant', 'Vehicle', 'Ignored'],
      ['98', '1', '3', 'Rick Mears', 'Penske Racing', 'Penske IndyCar', 'not imported'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Entrants');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([buffer], 'entrants.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(file, 'arrayBuffer', { value: vi.fn(async () => buffer) });
    const motorsportCatalog: EventCatalogState = {
      ...catalog,
      events: catalog.events.map((event) => event.id === 'event-1' ? { ...event, discipline: 'motorsport' } : event),
    };

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={motorsportCatalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onImportEntrants={onImportEntrants}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          selectedCategoryId="cat-1"
          selectedEventId="event-1"
        />
      );
    });

    const input = container.querySelector('input[aria-label="Entrants Import File"]') as HTMLInputElement;
    expect(input.accept).toContain('.xlsx');
    expect(container.querySelector('input[aria-label="Entrant Vehicle"]')).toBeNull();
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      await Promise.resolve();
    });

    expect(onImportEntrants).toHaveBeenCalledWith('event-1', [expect.objectContaining({
      entrantName: 'Penske Racing',
      firstName: 'Rick',
      lastName: 'Mears',
      raceNumber: '3',
      startOrder: 1,
      transponderNumber: '98',
      vehicle: 'Penske IndyCar',
    })], 'entrants.xlsx', 'cat-1');
    expect(container.textContent).toContain('Updating 1 entrant record from entrants.xlsx...');
    await act(async () => {
      completeImport?.();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Imported 1 entrant record from entrants.xlsx.');
  });

  it('shows and edits selected participant identification values', async () => {
    const onUpdateParticipantIdentifiers = vi.fn();

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          onUpdateParticipantIdentifiers={onUpdateParticipantIdentifiers}
          raceState={raceState}
          selectedEntrantId="ent-1"
          selectedEventId="event-1"
        />,
      );
    });

    const entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).toContain('#73');
    expect(entrantList?.textContent).toContain('Tx1234');
    expect(container.textContent).toContain('Identification');
    expect(container.textContent).toContain('Race Numbers');
    expect(container.textContent).toContain('Timing devices');
    expect(container.textContent).toContain('Licences');

    const raceNumbersInput = container.querySelector('input[aria-label="Race plate Pat Rider 1"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(raceNumbersInput, '822');
      blurInput(raceNumbersInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('ent-1', 'racePlate', ['822']);

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add device')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const timingDevicesSecondInput = container.querySelector('input[aria-label="Timing device Pat Rider 2"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(timingDevicesSecondInput, '10000223');
      blurInput(timingDevicesSecondInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('ent-1', 'txNo', [
      expect.objectContaining({ txNo: 1234 }),
      expect.objectContaining({ txNo: 10000223 }),
    ]);
  });

  it('shows editable identifier rows for a participant with no assigned identifiers', async () => {
    const onUpdateParticipantIdentifiers = vi.fn();

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          onUpdateParticipantIdentifiers={onUpdateParticipantIdentifiers}
          raceState={raceState}
          selectedEntrantId="ent-empty"
          selectedEventId="event-1"
        />,
      );
    });

    expect(container.textContent).toContain('Add plate');
    expect(container.textContent).toContain('Add device');

    const racePlateInputs = () => Array.from(container.querySelectorAll('input[aria-label^="Race plate Empty Rider"]')) as HTMLInputElement[];
    const timingDeviceInputs = () => Array.from(container.querySelectorAll('input[aria-label^="Timing device Empty Rider"]')) as HTMLInputElement[];
    expect(racePlateInputs()).toHaveLength(1);
    expect(timingDeviceInputs()).toHaveLength(1);

    const addPlateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add plate') as HTMLButtonElement | undefined;
    expect(addPlateButton).toBeDefined();
    expect(addPlateButton!.disabled).toBe(true);

    await act(async () => {
      setInputValue(racePlateInputs()[0]!, '#44');
      blurInput(racePlateInputs()[0]!);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('ent-empty', 'racePlate', ['44']);

    const removePlateButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Remove plate 1 for Empty Rider') as HTMLButtonElement | undefined;
    expect(removePlateButton).toBeDefined();
    expect(removePlateButton!.disabled).toBe(true);
  });

  it('shows add controls and emits identifier updates for a selected entrant without a loaded participant', async () => {
    const onUpdateParticipantIdentifiers = vi.fn();

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          onUpdateParticipantIdentifiers={onUpdateParticipantIdentifiers}
          raceState={raceState}
          selectedEntrantId="ent-unassigned"
          selectedEventId="event-2"
        />,
      );
    });

    expect(container.textContent).not.toContain('No participant is selected.');
    expect(container.textContent).toContain('Add plate');
    expect(container.textContent).toContain('Add device');

    const racePlateInput = container.querySelector('input[aria-label="Race plate No Category 1"]') as HTMLInputElement;
    const timingDeviceInput = container.querySelector('input[aria-label="Timing device No Category 1"]') as HTMLInputElement;
    expect(racePlateInput).toBeTruthy();
    expect(timingDeviceInput).toBeTruthy();

    await act(async () => {
      setInputValue(racePlateInput, '#88');
      blurInput(racePlateInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('ent-unassigned', 'racePlate', ['88']);

    await act(async () => {
      setInputValue(timingDeviceInput, 'Tx7701');
      blurInput(timingDeviceInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('ent-unassigned', 'txNo', [
      expect.objectContaining({ txNo: 7701 }),
    ]);
  });

  it('updates Entrant Details and Identification from the same selected entrant state when a card is clicked', async () => {
    const Harness = (): React.ReactElement => {
      const [selectedEntrantId, setSelectedEntrantId] = React.useState<string | undefined>('ent-1');
      const [selectedEventId] = React.useState<string | undefined>('event-1');

      return (
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={setSelectedEntrantId}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          onUpdateParticipantIdentifiers={() => undefined}
          raceState={raceState}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEventId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe('Pat Rider');
    expect(container.querySelector('input[aria-label="Race plate Pat Rider 1"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Race plate Empty Rider 1"]')).toBeFalsy();

    const emptyRiderCard = Array.from(container.querySelectorAll('button')).find((button) => button.querySelector('strong')?.textContent === 'Empty Rider');
    expect(emptyRiderCard).toBeDefined();

    await act(async () => {
      emptyRiderCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe('Empty Rider');
    expect(container.querySelector('input[aria-label="Race plate Empty Rider 1"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Race plate Pat Rider 1"]')).toBeFalsy();

    const emptyRiderSelectedCard = Array.from(container.querySelectorAll('button')).find((button) => button.querySelector('strong')?.textContent === 'Empty Rider');
    expect(emptyRiderSelectedCard?.getAttribute('aria-selected')).toBe('true');
  });

  it('updates Identification when selecting individual entrants in a mixed team event', async () => {
    const selectionEvents: string[] = [];

    const Harness = (): React.ReactElement => {
      const [selectedEntrantId, setSelectedEntrantId] = React.useState<string | undefined>('p-2');
      const handleSelectEntrant = (entrantId: string): void => {
        selectionEvents.push(entrantId);
        setSelectedEntrantId(entrantId);
      };

      return (
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={handleSelectEntrant}
          onSelectEvent={() => undefined}
          onUpdateEntrant={() => undefined}
          onUpdateParticipantIdentifiers={() => undefined}
          raceState={raceState}
          selectedEntrantId={selectedEntrantId}
          selectedEventId="event-2"
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe('Blue One');
    expect(container.querySelector('input[aria-label="Race plate Blue One 1"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Race plate Blue Two 1"]')).toBeFalsy();

    const blueTwoCard = Array.from(container.querySelectorAll('button')).find((button) => button.querySelector('strong')?.textContent === 'Blue Two');
    expect(blueTwoCard).toBeDefined();

    await act(async () => {
      blueTwoCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectionEvents).toEqual(['ent-blue-two']);
    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe('Blue Two');
    expect(container.querySelector('input[aria-label="Race plate Blue Two 1"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Race plate Blue One 1"]')).toBeFalsy();
  });

  it('prompts before replacing a dirty entrant form and saves before continuing', async () => {
    const onUpdateEntrant = vi.fn().mockResolvedValue(undefined);

    const Harness = () => {
      const [selectedEventId, setSelectedEventId] = React.useState<string | undefined>('event-1');
      const [selectedEntrantId, setSelectedEntrantId] = React.useState<string | undefined>('ent-1');

      return (
        <EntrantsPage
          catalog={catalog}
          onCreateEntrant={() => undefined}
          onDeleteEntrant={() => undefined}
          onSelectEntrant={setSelectedEntrantId}
          onSelectEvent={(eventId) => {
            setSelectedEventId(eventId);
            setSelectedEntrantId(catalog.entrants.find((entrant) => entrant.eventId === eventId)?.id);
          }}
          onUpdateEntrant={onUpdateEntrant}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEventId}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      setInputValue(container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement, 'Pat Edited');
    });

    const eventSelect = container.querySelector('select[aria-label="Entrants Event"]') as HTMLSelectElement;
    await act(async () => {
      eventSelect.value = 'event-2';
      eventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('.warning-modal-backdrop')).toBeTruthy();
    expect(container.textContent).toContain('You have unsaved changes to entrant Pat Rider - save or discard changes?');

    const promptSaveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
    expect(promptSaveButton).toBeDefined();

    await act(async () => {
      promptSaveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-1', expect.objectContaining({ name: 'Pat Edited' }));
    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe('Team Blue');
  });

  it('updates entrant lists when catalog state receives team creation and membership update events', async () => {
    const eventId = 'event-live-team';
    const categoryId = 'cat-live-team';
    const teamId = 'team-live-relay';
    const participantId = 'participant-live-rider';
    const baseMutations: EventCatalogLedger['mutations'] = [
      {
        event: {
          categoryIds: [categoryId],
          date: '2026-06-26',
          entrantIds: [participantId],
          format: 'race-weekend',
          id: eventId,
          name: 'Live Team Event',
          sessionIds: [],
        },
        id: 'mutation-event-created',
        timestamp: '2026-06-26T00:00:00.000Z',
        type: 'event-created',
      },
      {
        category: {
          eventId,
          id: categoryId,
          name: 'Team Category',
          teamRules: { maxTeamSize: 3, teamCompositionRules: [] },
        },
        id: 'mutation-category-created',
        timestamp: '2026-06-26T00:00:01.000Z',
        type: 'category-created',
      },
      {
        entrant: {
          categoryId,
          categoryIds: [categoryId],
          entrantType: 'rider',
          eventId,
          firstName: 'Live',
          id: participantId,
          lastName: 'Rider',
          memberParticipantIds: [participantId],
          name: 'Live Rider',
          sessionIds: [],
        },
        id: 'mutation-participant-created',
        timestamp: '2026-06-26T00:00:02.000Z',
        type: 'entrant-created',
      },
    ];
    const createLedger = (mutations: EventCatalogLedger['mutations']): EventCatalogLedger => ({
      ...createDefaultEventCatalogLedger(),
      mutations,
    });
    const renderCatalog = async (catalog: EventCatalogState): Promise<void> => {
      await act(async () => {
        root.render(
          <EntrantsPage
            catalog={catalog}
            onCreateEntrant={() => undefined}
            onDeleteEntrant={() => undefined}
            onSelectEntrant={() => undefined}
            onSelectEvent={() => undefined}
            onUpdateEntrant={() => undefined}
            selectedEventId={eventId}
          />,
        );
      });
    };

    await renderCatalog(applyEventCatalogLedger(createLedger(baseMutations)));
    let entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).toContain('Live Rider');
    expect(entrantList?.textContent).not.toContain('Team Relay');

    const createdTeamMutations: EventCatalogLedger['mutations'] = [
      ...baseMutations,
      {
        entrant: {
          categoryId,
          categoryIds: [categoryId],
          entrantType: 'team',
          eventId,
          id: teamId,
          memberParticipantIds: [],
          name: 'Team Relay',
          sessionIds: [],
          teamMembers: [],
        },
        id: 'mutation-team-created',
        timestamp: '2026-06-26T00:00:03.000Z',
        type: 'entrant-created',
      },
      {
        changes: {
          entrantIds: [participantId, teamId],
        },
        eventId,
        id: 'mutation-event-entrant-list-updated',
        timestamp: '2026-06-26T00:00:04.000Z',
        type: 'event-updated',
      },
    ];

    await renderCatalog(applyEventCatalogLedger(createLedger(createdTeamMutations)));
    entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).toContain('Live Rider');
    expect(entrantList?.textContent).toContain('Individual Drivers');
    expect(entrantList?.textContent).toContain('Teams');
    expect(entrantList?.textContent).toContain('Team Relay');

    const membershipUpdatedMutations: EventCatalogLedger['mutations'] = [
      ...createdTeamMutations,
      {
        changes: {
          memberParticipantIds: [participantId],
          teamMembers: [{ categoryId, firstName: 'Live', lastName: 'Rider', participantId }],
        },
        entrantId: teamId,
        id: 'mutation-team-member-added',
        timestamp: '2026-06-26T00:00:05.000Z',
        type: 'entrant-updated',
      },
      {
        changes: {
          teamEntrantId: teamId,
        },
        entrantId: participantId,
        id: 'mutation-participant-team-linked',
        timestamp: '2026-06-26T00:00:06.000Z',
        type: 'entrant-updated',
      },
    ];

    await renderCatalog(applyEventCatalogLedger(createLedger(membershipUpdatedMutations)));
    entrantList = container.querySelector('[aria-label="Entrants for selected event"]');
    expect(entrantList?.textContent).toContain('Team: Team Relay');
  });
});
