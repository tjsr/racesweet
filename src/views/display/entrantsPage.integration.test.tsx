// @vitest-environment jsdom

import { type Root, createRoot } from 'react-dom/client';
import { EntrantsPage } from './entrantsPage.js';
import { type EventCatalogState } from '../../catalog/eventCatalog.js';
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

    await act(async () => {
      root.render(
        <EntrantsPage
          catalog={catalog}
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
    const categoryInput = container.querySelector('select[aria-label="Entrant Category"]') as HTMLSelectElement;
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Entrant');

    await act(async () => {
      setInputValue(firstNameInput, 'Jordan');
      setInputValue(surnameInput, 'Taylor');
      setSelectValue(genderInput, 'female');
      setInputValue(dobInput, '1998-12-24');
      setSelectValue(categoryInput, 'cat-1');
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUpdateEntrant).toHaveBeenCalledWith('ent-1', expect.objectContaining({
      categoryId: 'cat-1',
      dateOfBirth: '1998-12-24',
      firstName: 'Jordan',
      gender: 'female',
      lastName: 'Taylor',
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
