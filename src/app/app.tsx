import { RaceState, Session } from '../model/racestate.ts';
import React, { useState } from 'react';

import { ApicalElectronFile } from '../testdata/apicalElectronFile.ts';
import { RecentRecords } from '../views/display/recent';
import { TestSession } from '../testdata/testsession';
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('app') as HTMLElement);

const loadRecords = () => {
  const apicalSession: TestSession = new ApicalElectronFile();

  const eventSession: TestSession = apicalSession; // undefined!; // rfidSession;
  eventSession
    .loadTestData(false)
    .then(() => {
      console.log('Test data loaded successfully.');
    })
    .catch((error) => {
      console.error('Error loading test data:', error);
    });

  // This function should load records from a data source.
  // For now, we return an empty array as a placeholder.
  return [];
};

const RaceSweetMainApp = () => {
  const records = loadRecords();

  const [sessionState, setSessionState] = useState<Session|undefined>(undefined);

  return <>
    <h1>Main content.</h1>
    <RecentRecords records={sessionState?.records || []} />
  </>
};

root.render(<RaceSweetMainApp />);
