import { RaceStateLookup, Session } from '../model/racestate.ts';
import React, { useEffect, useState } from 'react';

import { ApicalElectronFile } from '../testdata/apicalElectronFile.ts';
import { CategoryList } from '../views/display/categories';
import { EventCategoryId } from '../model/eventcategory';
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
  const [sessionState, setSessionState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [errorState, setErrorState] = useState<Error|undefined>(undefined);
  const [selectedCategories, setCategorySelected] = useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
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

  return <>
    <h1>Main content.</h1>
    <CategoryList categories={sessionState.categories || []} categorySelected={setCategorySelected} />
    <RecentRecords
      records={sessionState.records || []}
      raceStateLookup={sessionState}
      selectedCategories={selectedCategories || new Set<EventCategoryId>()}
    />
  </>
};

root.render(<RaceSweetMainApp />);
