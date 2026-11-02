import { Box, Tab, Tabs } from '@mui/material';
import { EntrantsPage } from '../../app/views/entrants/entrantsPage.js';
import React from 'react';
import { OfficialsPanel, type OfficialsPanelProps } from './OfficialsPanel.js';

type EntrantsContextProps = React.ComponentProps<typeof EntrantsPage> & {
  officials: Omit<OfficialsPanelProps, 'catalog' | 'selectedEventId'>;
};

export const EntrantsContext = (props: EntrantsContextProps): React.ReactElement => {
  const [tab, setTab] = React.useState<'entrants' | 'individuals'>('entrants');
  const { officials, ...entrantProps } = props;
  return <Box sx={{ minWidth: 0 }}>
    <Tabs aria-label="Participant areas" value={tab} variant="scrollable" scrollButtons="auto"
      onChange={(_event: React.SyntheticEvent, value: 'entrants' | 'individuals'): void => setTab(value)}>
      <Tab label="Entrants" value="entrants" />
      <Tab label="Individuals" value="individuals" />
    </Tabs>
    {tab === 'entrants'
      ? <EntrantsPage {...entrantProps} />
      : <OfficialsPanel catalog={props.catalog} selectedEventId={props.selectedEventId} {...officials} />}
  </Box>;
};
