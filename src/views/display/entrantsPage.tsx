import { TextField } from '@mui/material';
import React from 'react';
import {
  type EntrantType,
  type EventCatalogEntrant,
  type EventCatalogEntry,
  type EventCatalogState,
  getCategoriesForEvent,
  getEntrantAssignedSessionIds,
  getEntrantsForEvent,
  getEntriesForEvent,
  getEventDisciplineLabels,
  getSessionsForEvent,
} from '../../catalog/eventCatalog.js';
import { type EntrantImportRecord, parseEntrantImportBuffer } from '../../processing/entrantImport.js';
import { EventEntrantId } from '../../model/entrant.js';
import type { EventEntryId } from '../../model/entry.js';
import { type EventCategoryId } from '../../model/eventcategory.js';
import { type EventParticipant, type EventParticipantId, type ParticipantIdentifierUpdate } from '../../model/eventparticipant.js';
import { EventId } from '../../model/raceevent.js';
import { type RaceState } from '../../model/racestate.js';
import { EntrantListPanel, getParticipantsForEntrant } from '../panels/entrantList.js';
import { EntrantDetailsPanel, type EntrantDraft } from '../panels/entrantDetailsPanel.js';
import { EntrantEntriesPanel } from '../panels/entrantEntriesPanel.js';
import { IdentificationPanel } from '../panels/identificationPanel.js';
import { FileSelectionField } from '../panels/fileSelectionField.js';
import { SelectedEntrantIdentificationPanel, SelectedEntrantSessionsPanel } from '../panels/selectedEntrantSummaries.js';
import { SelectedEntrantsPanel } from '../panels/selectedEntrantsPanel.js';
import { SessionListPanel } from '../panels/sessionList.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';

interface EntrantsPageProps {
  catalog: EventCatalogState;
  enableMultiplePlates?: boolean;
  onCreateEntrant: (eventId: EventId, entrantType?: EntrantType) => void | Promise<void>;
  onDeleteEntrant: (eventId: EventId, entrantId: EventEntrantId) => void | Promise<void>;
  onDeleteEntrants?: (eventId: EventId, entrantIds: EventEntrantId[]) => void | Promise<void>;
  onImportEntrants?: (eventId: EventId, records: EntrantImportRecord[], fileName: string, defaultCategoryId?: EventCategoryId) => void | Promise<void>;
  onSelectEntrant: (entrantId: EventEntrantId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateParticipantIdentifiers?: (participantId: EventParticipantId, identifierType: 'racePlate' | 'txNo', values: ParticipantIdentifierUpdate[]) => void | Promise<void>;
  onUpdateEntrant: (entrantId: EventEntrantId, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'identifiers' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'startOrder' | 'teamEntrantId' | 'teamMembers' | 'vehicle'>>) => void | Promise<void>;
  onUpdateEntry?: (entryId: EventEntryId, changes: Partial<Pick<EventCatalogEntry, 'categoryId' | 'identifiers' | 'name' | 'raceNumber' | 'startOrder' | 'vehicle'>>) => void | Promise<void>;
  raceState?: Partial<RaceState>;
  selectedCategoryId?: EventCategoryId;
  selectedEntrantId?: EventEntrantId;
  selectedEventId?: EventId;
}

const UNSPECIFIED_GENDER = 'unspecified';
const CATEGORY_FILTER_ALL = 'all';
const CATEGORY_FILTER_UNASSIGNED = 'unassigned';

const getEntrantDraft = (
  entrant: EventCatalogEntrant | undefined,
  owningEntrantId?: EventEntrantId,
): EntrantDraft => ({
  categoryId: entrant?.categoryId || entrant?.categoryIds[0] || '',
  dateOfBirth: entrant?.dateOfBirth || '',
  firstName: entrant?.firstName || '',
  gender: entrant?.gender || UNSPECIFIED_GENDER,
  lastName: entrant?.lastName || '',
  name: entrant?.name || '',
  notes: entrant?.notes || '',
  startOrder: entrant?.startOrder?.toString() || '',
  teamEntrantId: owningEntrantId || entrant?.teamEntrantId || '',
  vehicle: entrant?.vehicle || '',
});

const eventSupportsTeams = (catalog: EventCatalogState, eventId: EventId | undefined): boolean => {
  if (!eventId) {
    return false;
  }

  return getCategoriesForEvent(catalog, eventId).some((category) => (category.teamRules?.maxTeamSize || 0) > 1) ||
    getEntrantsForEvent(catalog, eventId).some((entrant) => entrant.entrantType === 'team');
};

const getFallbackParticipantForEntrant = (entrant: EventCatalogEntrant | undefined): EventParticipant | undefined => {
  if (!entrant || entrant.entrantType !== 'rider') {
    return undefined;
  }

  const participantId = entrant.memberParticipantIds[0] || entrant.id;

  return {
    categoryId: entrant.categoryId || entrant.categoryIds[0] || '',
    currentResult: undefined,
    entrantId: entrant.id,
    firstname: entrant.firstName || entrant.name,
    id: participantId,
    identifiers: [...(entrant.identifiers || [])],
    lastRecordTime: null,
    resultDuration: null,
    surname: entrant.lastName || '',
  };
};

export const EntrantsPage = (props: EntrantsPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventEntrants = getEntrantsForEvent(props.catalog, selectedEvent?.id);
  const eventEntries = getEntriesForEvent(props.catalog, selectedEvent?.id);
  const eventCategories = getCategoriesForEvent(props.catalog, selectedEvent?.id);
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const raceStateParticipants = props.raceState?.participants || [];
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState<string>(CATEGORY_FILTER_ALL);
  const [selectedImportFileName, setSelectedImportFileName] = React.useState<string>('');
  const [importStatus, setImportStatus] = React.useState<string>('');
  const [deleteEntrantId, setDeleteEntrantId] = React.useState<string | undefined>(undefined);
  const [deleteError, setDeleteError] = React.useState<string | undefined>(undefined);
  const [deleteStatus, setDeleteStatus] = React.useState<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  const [bulkDeleteError, setBulkDeleteError] = React.useState<string | undefined>(undefined);
  const [bulkDeleteStatus, setBulkDeleteStatus] = React.useState<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  const [multiSelectionAnchorId, setMultiSelectionAnchorId] = React.useState<EventEntrantId | undefined>(undefined);
  const [multiSelectedEntrantIds, setMultiSelectedEntrantIds] = React.useState<Set<EventEntrantId>>(new Set<EventEntrantId>());
  const teamEntrants = eventEntrants.filter((entrant) => entrant.entrantType === 'team');
  const eventCategoryIds = new Set(eventCategories.map((category) => category.id.toString()));
  const eventCategoryKey = eventCategories.map((category) => category.id.toString()).join('|');
  const disciplineLabels = getEventDisciplineLabels(selectedEvent?.discipline);
  const isMotorsport = selectedEvent?.discipline === 'motorsport';

  React.useEffect(() => {
    const validCategoryIds = new Set(eventCategoryKey.split('|').filter((categoryId) => categoryId.length > 0));

    if (
      selectedCategoryFilter !== CATEGORY_FILTER_ALL &&
      selectedCategoryFilter !== CATEGORY_FILTER_UNASSIGNED &&
      !validCategoryIds.has(selectedCategoryFilter)
    ) {
      setSelectedCategoryFilter(CATEGORY_FILTER_ALL);
    }
  }, [eventCategoryKey, selectedCategoryFilter]);

  const getEntrantCategoryIds = (entrant: EventCatalogEntrant): string[] => {
    const participantIds = new Set(entrant.memberParticipantIds.map((participantId) => participantId.toString()));
    const entryCategoryIds = eventEntries
      .filter((entry) => (
        entry.id.toString() === entrant.id.toString() ||
        entry.entrantId?.toString() === entrant.id.toString() ||
        entry.participantIds.some((participantId) => participantIds.has(participantId.toString()))
      ))
      .map((entry) => entry.categoryId?.toString() || '');
    return Array.from(new Set([
      entrant.categoryId?.toString() || '',
      ...entrant.categoryIds.map((categoryId) => categoryId.toString()),
      ...entryCategoryIds,
    ].filter((categoryId) => eventCategoryIds.has(categoryId))));
  };

  const entrantMatchesCategoryFilter = (entrant: EventCatalogEntrant): boolean => {
    if (selectedCategoryFilter === CATEGORY_FILTER_ALL) {
      return true;
    }

    const validCategoryIds = getEntrantCategoryIds(entrant);
    if (selectedCategoryFilter === CATEGORY_FILTER_UNASSIGNED) {
      return validCategoryIds.length === 0;
    }

    return validCategoryIds.includes(selectedCategoryFilter);
  };

  const filteredEventEntrants = eventEntrants.filter((entrant) => entrantMatchesCategoryFilter(entrant));
  const riderEntrants = filteredEventEntrants.filter((entrant) => entrant.entrantType === 'rider');
  const filteredTeamEntrants = filteredEventEntrants.filter((entrant) => entrant.entrantType === 'team');
  const teamsEnabled = eventSupportsTeams(props.catalog, selectedEvent?.id);
  const selectedEntrant = filteredEventEntrants.find((entrant) => entrant.id === props.selectedEntrantId) ?? filteredEventEntrants[0];
  const selectedEntrants = multiSelectedEntrantIds.size > 1
    ? filteredEventEntrants.filter((entrant) => multiSelectedEntrantIds.has(entrant.id))
    : selectedEntrant ? [selectedEntrant] : [];
  const hasMultipleSelectedEntrants = selectedEntrants.length > 1;
  const selectedEntrantParticipantIds = new Set(
    (selectedEntrant?.memberParticipantIds || []).map((participantId) => participantId.toString()),
  );
  const selectedEntry = selectedEntrant?.entrantType === 'rider'
    ? eventEntries.find((entry) => (
      entry.id.toString() === selectedEntrant.id.toString() ||
      entry.participantIds.some((participantId) => selectedEntrantParticipantIds.has(participantId.toString()))
    ))
    : undefined;
  const selectedOwningEntrantId = selectedEntry?.entrantId;
  const selectedParticipants = getParticipantsForEntrant(selectedEntrant, raceStateParticipants, eventEntrants);
  const selectedIdentificationParticipant = selectedParticipants[0] || getFallbackParticipantForEntrant(selectedEntrant);
  const identificationParticipants = selectedParticipants.length > 0
    ? selectedParticipants
    : selectedIdentificationParticipant
      ? [selectedIdentificationParticipant]
      : [];
  const selectedEntrantDraft = React.useMemo(
    () => getEntrantDraft(selectedEntrant, selectedOwningEntrantId),
    [selectedEntrant, selectedOwningEntrantId],
  );
  const [createKind, setCreateKind] = React.useState<EntrantType>('rider');
  const [entrantDraft, setEntrantDraft] = React.useState<EntrantDraft>(selectedEntrantDraft);
  const [savedEntrantDraft, setSavedEntrantDraft] = React.useState<EntrantDraft>(selectedEntrantDraft);
  const hasUnsavedChanges = selectedEntrant
    ? JSON.stringify(entrantDraft) !== JSON.stringify(savedEntrantDraft)
    : false;

  React.useEffect(() => {
    setEntrantDraft(selectedEntrantDraft);
    setSavedEntrantDraft(selectedEntrantDraft);
  }, [selectedEntrantDraft]);

  React.useEffect(() => {
    if (deleteStatus === 'succeeded' && selectedEntrant && selectedEntrant.id !== props.selectedEntrantId) {
      props.onSelectEntrant(selectedEntrant.id);
    }
  }, [deleteStatus, props.onSelectEntrant, props.selectedEntrantId, selectedEntrant]);

  React.useEffect(() => {
    setMultiSelectedEntrantIds(new Set<EventEntrantId>());
    setMultiSelectionAnchorId(undefined);
  }, [selectedEvent?.id]);

  const selectedEntrantSessionIds = getEntrantAssignedSessionIds(selectedEntrant, eventCategories, eventSessions, eventEntrants);
  const selectedEntrantSessions = eventSessions.filter((session) => selectedEntrantSessionIds.has(session.id));
  const sessionsBySelectedEntrantId = new Map(selectedEntrants.map((entrant) => [
    entrant.id.toString(),
    eventSessions.filter((session) => getEntrantAssignedSessionIds(entrant, eventCategories, eventSessions, eventEntrants).has(session.id)),
  ]));
  const selectedParentEntrantId = selectedOwningEntrantId || selectedEntrant?.teamEntrantId;
  const selectedTeamName = selectedParentEntrantId
    ? teamEntrants.find((team) => team.id === selectedParentEntrantId)?.name
    : undefined;
  const selectedTeamMembers = selectedEntrant?.entrantType === 'team'
    ? riderEntrants
      .filter((entrant) => {
        if (entrant.teamEntrantId === selectedEntrant.id) {
          return true;
        }
        return eventEntries.some((entry) => (
          entry.entrantId === selectedEntrant.id &&
          entry.participantIds.some((participantId) => entrant.memberParticipantIds.includes(participantId))
        ));
      })
      .map((entrant) => entrant.name)
    : [];
  const entryOwnerEntrants = teamEntrants.filter((entrant) => entrant.isEntryOwner === true);
  const selectableParentEntrants = isMotorsport && entryOwnerEntrants.length > 0
    ? entryOwnerEntrants
    : teamEntrants;
  const selectedEntrantEntries = !isMotorsport || !selectedEntrant
    ? []
    : selectedEntrant.isEntryOwner
      ? eventEntries.filter((entry) => entry.entrantId === selectedEntrant.id)
      : selectedEntry
        ? [selectedEntry]
        : [];

  const saveEntrant = async (): Promise<boolean> => {
    if (!selectedEntrant) {
      return true;
    }

    if (selectedEntrant.entrantType === 'team') {
      await props.onUpdateEntrant(selectedEntrant.id, {
        categoryId: entrantDraft.categoryId || undefined,
        name: entrantDraft.name,
        notes: entrantDraft.notes || undefined,
        startOrder: isMotorsport && entrantDraft.startOrder ? Number(entrantDraft.startOrder) : undefined,
        vehicle: isMotorsport ? entrantDraft.vehicle || undefined : undefined,
      });
      setSavedEntrantDraft(entrantDraft);
      return true;
    }

    await props.onUpdateEntrant(selectedEntrant.id, {
      categoryId: isMotorsport ? undefined : entrantDraft.categoryId || undefined,
      dateOfBirth: entrantDraft.dateOfBirth || undefined,
      firstName: entrantDraft.firstName || undefined,
      gender: entrantDraft.gender === UNSPECIFIED_GENDER ? undefined : entrantDraft.gender,
      lastName: entrantDraft.lastName || undefined,
      name: isMotorsport
        ? `${entrantDraft.firstName} ${entrantDraft.lastName}`.trim() || selectedEntrant.name
        : entrantDraft.name,
      notes: entrantDraft.notes || undefined,
      startOrder: isMotorsport ? undefined : entrantDraft.startOrder ? Number(entrantDraft.startOrder) : undefined,
      teamEntrantId: isMotorsport ? selectedEntrant.teamEntrantId : entrantDraft.teamEntrantId || undefined,
      vehicle: isMotorsport ? undefined : entrantDraft.vehicle || undefined,
    });
    setSavedEntrantDraft(entrantDraft);
    return true;
  };

  const deleteEntrant = async (): Promise<void> => {
    if (!selectedEvent || !selectedEntrant) {
      return;
    }

    setDeleteEntrantId(selectedEntrant.id.toString());
    setDeleteStatus('pending');
    setDeleteError(undefined);
    try {
      await props.onDeleteEntrant(selectedEvent.id, selectedEntrant.id);
      setDeleteStatus('succeeded');
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : String(error));
      setDeleteStatus('failed');
    }
  };
  const isDeletingSelectedEntrant = deleteEntrantId === selectedEntrant?.id.toString();

  const selectEntrant = (entrantId: EventEntrantId, selectionMode?: 'range' | 'toggle', orderedEntrantIds: EventEntrantId[] = []): void => {
    if (!selectionMode) {
      setMultiSelectedEntrantIds(new Set<EventEntrantId>());
      setMultiSelectionAnchorId(entrantId);
      props.onSelectEntrant(entrantId);
      return;
    }

    const rangeAnchorId = multiSelectionAnchorId || selectedEntrant?.id || entrantId;
    if (selectionMode === 'range') {
      setMultiSelectionAnchorId(rangeAnchorId);
    }

    setMultiSelectedEntrantIds((current) => {
      const next = new Set<EventEntrantId>(current.size > 0 ? current : selectedEntrant ? [selectedEntrant.id] : []);
      if (selectionMode === 'toggle') {
        if (next.has(entrantId)) {
          next.delete(entrantId);
        } else {
          next.add(entrantId);
        }
        return next;
      }

      const anchorIndex = orderedEntrantIds.indexOf(rangeAnchorId);
      const targetIndex = orderedEntrantIds.indexOf(entrantId);
      if (anchorIndex === -1 || targetIndex === -1) {
        return new Set<EventEntrantId>([rangeAnchorId, entrantId]);
      }
      return new Set<EventEntrantId>(orderedEntrantIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1));
    });
  };

  const updateSelectedEntrantCategories = async (categoryId: string | undefined, removeCategoryId?: string): Promise<void> => {
    await Promise.all(selectedEntrants.map((entrant) => {
      const categoryIds = removeCategoryId
        ? entrant.categoryIds.filter((id) => id.toString() !== removeCategoryId)
        : categoryId ? [categoryId as EventCategoryId] : entrant.categoryIds;
      const primaryCategoryId = removeCategoryId
        ? entrant.categoryId?.toString() === removeCategoryId ? categoryIds[0] : entrant.categoryId
        : categoryId as EventCategoryId | undefined;
      return props.onUpdateEntrant(entrant.id, { categoryId: primaryCategoryId, categoryIds });
    }));
  };

  const deleteSelectedEntrants = async (): Promise<void> => {
    if (!selectedEvent || selectedEntrants.length === 0) {
      return;
    }

    setBulkDeleteStatus('pending');
    setBulkDeleteError(undefined);
    try {
      if (props.onDeleteEntrants) {
        await props.onDeleteEntrants(selectedEvent.id, selectedEntrants.map((entrant) => entrant.id));
      } else {
        await Promise.all(selectedEntrants.map((entrant) => props.onDeleteEntrant(selectedEvent.id, entrant.id)));
      }
      setMultiSelectedEntrantIds(new Set<EventEntrantId>());
      setBulkDeleteStatus('succeeded');
    } catch (error: unknown) {
      setBulkDeleteError(error instanceof Error ? error.message : String(error));
      setBulkDeleteStatus('failed');
    }
  };

  const handleImportFile = (file: File): void => {
    if (!selectedEvent || !props.onImportEntrants) {
      return;
    }

    setSelectedImportFileName(file.name);
    setImportStatus(`Reading ${file.name}...`);
    void file.arrayBuffer()
      .then(async (buffer) => {
        const records = parseEntrantImportBuffer(buffer);
        setImportStatus(`Updating ${records.length} entrant record${records.length === 1 ? '' : 's'} from ${file.name}...`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        const selectedContextCategoryId = eventCategories.some((category) => (
          category.id.toString() === props.selectedCategoryId?.toString()
        )) ? props.selectedCategoryId : undefined;
        const defaultCategoryId = selectedContextCategoryId || (
          selectedCategoryFilter !== CATEGORY_FILTER_ALL &&
          selectedCategoryFilter !== CATEGORY_FILTER_UNASSIGNED
            ? selectedCategoryFilter
            : undefined
        );
        if (defaultCategoryId) {
          await props.onImportEntrants?.(selectedEvent.id, records, file.name, defaultCategoryId);
        } else {
          await props.onImportEntrants?.(selectedEvent.id, records, file.name);
        }
        setImportStatus(`Imported ${records.length} entrant record${records.length === 1 ? '' : 's'} from ${file.name}.`);
      })
      .catch((error: unknown) => {
        setImportStatus(error instanceof Error ? error.message : `Unable to import ${file.name}.`);
      });
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedEntrant,
    itemName: selectedEntrant?.name || selectedEntrant?.id,
    itemType: 'entrant',
    onSave: saveEntrant,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });

  return (
    <section className="events-screen">
      <h1>Entrants</h1>
      <TextField
        className="page-filter-label"
        label="Event"
        select
        slotProps={{ select: { 'aria-label': 'Entrants Event', native: true } }}
        value={selectedEvent?.id || ''}
        onChange={(event) => {
          const eventId = event.target.value;
          requestFormExit(() => props.onSelectEvent(eventId));
        }}
      >
        {props.catalog.events.map((event) => (
          <option key={event.id} value={event.id}>{event.name}</option>
        ))}
      </TextField>
      <FileSelectionField
        accept=".csv,.txt,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
        ariaLabel="Entrants Import File"
        disabled={!selectedEvent || !props.onImportEntrants}
        label="Entrant file"
        onSelectFile={handleImportFile}
        placeholder="No entrant file selected"
        value={selectedImportFileName}
      />
      {importStatus ? <p aria-live="polite" className="page-filter-status">{importStatus}</p> : null}
      <TextField
        className="page-filter-label"
        label="Category"
        select
        slotProps={{ select: { 'aria-label': 'Entrants Category', native: true } }}
        value={selectedCategoryFilter}
        onChange={(event) => setSelectedCategoryFilter(event.target.value)}
      >
        <option value={CATEGORY_FILTER_ALL}>All</option>
        <option value={CATEGORY_FILTER_UNASSIGNED}>Unassigned</option>
        {eventCategories.map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </TextField>
      <div className="events-layout">
        <EntrantListPanel
          catalog={props.catalog}
          createKind={createKind}
          filteredTeamEntrants={filteredTeamEntrants}
          onCreateEntrant={props.onCreateEntrant}
          onSelectEntrant={selectEntrant}
          raceStateParticipants={raceStateParticipants}
          requestFormExit={requestFormExit}
          riderEntrants={riderEntrants}
          selectedEntrant={selectedEntrant}
          selectedEntrantIds={hasMultipleSelectedEntrants ? multiSelectedEntrantIds : undefined}
          selectedEventId={selectedEvent?.id}
          isMotorsport={isMotorsport}
          singularLabel={disciplineLabels.singular}
          pluralLabel={disciplineLabels.plural}
          setCreateKind={setCreateKind}
          teamEntrants={teamEntrants}
          teamsEnabled={teamsEnabled}
        />
        <div className="event-summary-column">
          {hasMultipleSelectedEntrants ? <SelectedEntrantsPanel
            categories={eventCategories}
            deleteError={bulkDeleteError}
            deleteStatus={bulkDeleteStatus}
            onDeleteSelected={() => requestFormExit(deleteSelectedEntrants)}
            onMoveToCategory={(categoryId) => updateSelectedEntrantCategories(categoryId)}
            onRemoveFromCategory={(categoryId) => updateSelectedEntrantCategories(undefined, categoryId)}
            selectedEntrants={selectedEntrants}
          /> : <EntrantDetailsPanel
            entrantAssignmentIsDerived={isMotorsport && !!selectedEntry}
            entrantLabel={disciplineLabels.singular}
            entrantDraft={entrantDraft}
            deleteError={isDeletingSelectedEntrant ? deleteError : undefined}
            deleteStatus={isDeletingSelectedEntrant ? deleteStatus : 'idle'}
            eventCategories={eventCategories}
            onDeleteEntrant={() => requestFormExit(deleteEntrant)}
            onSaveEntrant={() => {
              void saveEntrant();
            }}
            onSetEntrantDraft={setEntrantDraft}
            selectedEntrant={selectedEntrant}
            selectedTeamName={selectedTeamName}
            isMotorsport={isMotorsport}
            showVehicle={isMotorsport}
            showTeamMembers={!isMotorsport}
            teamMemberLabel={disciplineLabels.plural}
            teamEntrants={selectableParentEntrants}
            teamMembers={selectedTeamMembers}
            warningModal={warningModal}
          />}
          {!hasMultipleSelectedEntrants && isMotorsport && selectedEntrant?.isEntryOwner && props.onUpdateEntry ? (
            <EntrantEntriesPanel
              categories={eventCategories}
              entries={selectedEntrantEntries}
              onUpdateDriver={props.onUpdateEntrant}
              onUpdateEntry={props.onUpdateEntry}
              participants={raceStateParticipants}
              riderEntrants={eventEntrants.filter((entrant) => entrant.entrantType === 'rider')}
            />
          ) : null}
        </div>
        <div className="event-summary-column">
          {hasMultipleSelectedEntrants ? <SelectedEntrantSessionsPanel entrants={selectedEntrants} sessionsByEntrantId={sessionsBySelectedEntrantId} /> : <SessionListPanel
            emptyText="No sessions are currently assigned to this entrant."
            sessions={selectedEntrantSessions}
            title="Sessions for Entrant"
          />}
          {hasMultipleSelectedEntrants ? <SelectedEntrantIdentificationPanel entrants={selectedEntrants} eventEntrants={eventEntrants} participants={raceStateParticipants} /> : <IdentificationPanel
            enableMultiplePlates={props.enableMultiplePlates}
            onUpdateParticipantIdentifiers={props.onUpdateParticipantIdentifiers}
            participants={identificationParticipants}
            selectedParticipant={selectedIdentificationParticipant}
          />}
        </div>
      </div>
    </section>
  );
};
