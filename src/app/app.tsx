import { RaceStateLookup, Session } from '../model/racestate.ts';
import React, { useEffect, useState } from 'react';

import { ApicalElectronFile } from '../testdata/apicalElectronFile.ts';
import { CategoryList } from '../views/display/categories';
import { EventCategoryId } from '../model/eventcategory';
import { EventParticipantId } from '../model/eventparticipant';
import type { EventTimeRecord } from '../model/timerecord';
import { HandicapView } from '../views/display/handicap';
import { RecentRecords } from '../views/display/recent';
import { TestSession } from '../testdata/testsession';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('app') as HTMLElement);

const loadRecords = async (
  // setSessionState: (session: Session|undefined) => void,
  // setErrorState: (error: Error|undefined) => void
): Promise<Session> => {
  const apicalSession: TestSession = new ApicalElectronFile();

  const eventSession: TestSession = apicalSession; // undefined!; // rfidSession;
  return eventSession.loadTestData(false).then(() => {
    console.log("Test data loaded successfully.");
    return eventSession;
    // setSessionState(eventSession);
    // setErrorState(undefined);
  });
};

const RaceSweetMainApp = () => {
  const [activeView, setActiveView] = useState<'recent' | 'handicap'>('recent');
  const [sessionState, setSessionState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [errorState, setErrorState] = useState<Error|undefined>(undefined);
  const [selectedCategories, setCategorySelected] = useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
  const [recordSelectedCategories, setRecordSelectedCategories] = useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
  const [recordSelectedParticipants, setRecordSelectedParticipants] = useState<Set<string>>(new Set<EventParticipantId>());

  useEffect(() => {
    if (!sessionState && !errorState) {
      loadRecords().then((session: Session) => {
        console.log("Records loaded:", session.records.length);
        setSessionState(session);
        setErrorState(undefined);
      });
    }
  }, [sessionState, errorState]);
  
  if (errorState) {
    return <>
      <h1>Error loading content</h1>
      <div className="error">
        <p>There was an error loading the content:</p>
        <pre>{errorState.toString()}</pre>
      </div>
    </>
  }
  console.log('Re-rendering RaceSweetMainApp');
  if (!sessionState) {
    return <>Loading...</>
  }

  const handleExcludeCrossing = (crossingId: string, exclude: boolean) => {
    sessionState.excludeCrossing(crossingId, exclude);
    setSessionState(new Session({
      records: sessionState.records,
      participants: sessionState.participants,
      categories: sessionState.categories,
      teams: sessionState.teams
    }));
  };

  const handleChangeCategory = (participantId: string, categoryId: EventCategoryId) => {
    sessionState.updateParticipantCategory(participantId, categoryId);
    
    if (recordSelectedParticipants?.has(participantId)) {
      setCategorySelected(new Set([categoryId]));
    }

    setSessionState(new Session({
      records: sessionState.records,
      participants: sessionState.participants,
      categories: sessionState.categories,
      teams: sessionState.teams
    }));
  };

  const hilightCategories = new Set<EventCategoryId>();
  if (recordSelectedCategories && recordSelectedCategories.size > 0) {
    recordSelectedCategories.forEach((categoryId: EventCategoryId) => {
      hilightCategories.add(categoryId);
    });
  }
  if (selectedCategories && selectedCategories.size > 0) {
    selectedCategories.forEach((categoryId: EventCategoryId) => {
      hilightCategories.add(categoryId);
    });
  }

  const viewSelector = (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      <button
        type='button'
        onClick={() => setActiveView('recent')}
        disabled={activeView === 'recent'}>
        Recent Records
      </button>
      <button
        type='button'
        onClick={() => setActiveView('handicap')}
        disabled={activeView === 'handicap'}>
        Handicap Data
      </button>
    </div>
  );

  return (
    <>
      <h1>Main content.</h1>
      {viewSelector}
      {activeView === 'handicap' ? (
        <HandicapView />
      ) : (
        <>
          <CategoryList categories={sessionState.categories || []} categorySelected={setCategorySelected} />
          <RecentRecords
            records={(sessionState.records as EventTimeRecord[]) || []}
            raceStateLookup={sessionState}
            selectedCategories={hilightCategories}
            selectedParticipants={recordSelectedParticipants}
            categorySelected={setRecordSelectedCategories}
            participantSelected={setRecordSelectedParticipants}
            onExclude={handleExcludeCrossing}
            onChangeCategory={handleChangeCategory}
          />
        </>
      )}
    </>
  );
};

root.render(<RaceSweetMainApp />);
