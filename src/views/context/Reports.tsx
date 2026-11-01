import { Box, Tab, Tabs } from '@mui/material';
import React from 'react';
import { ReportsPage } from '../../app/views/reports/reportsPage.js';
import { DisplayScreensPanel, type DisplayScreensPanelProps } from './DisplayScreensPanel.js';

type ReportsContextProps = React.ComponentProps<typeof ReportsPage> & {
  displayScreens?: DisplayScreensPanelProps;
};

export const ReportsContext = (props: ReportsContextProps): React.ReactElement => {
  const [workspace, setWorkspace] = React.useState<'reports' | 'displays'>('reports');
  return <Box sx={{ minWidth: 0 }}>
    {props.displayScreens ? <Tabs aria-label="Reports workspaces" value={workspace}
      onChange={(_event: React.SyntheticEvent, value: 'reports' | 'displays'): void => setWorkspace(value)}
      variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
      <Tab label="Race reports" value="reports" />
      <Tab label="Display screens" value="displays" />
    </Tabs> : null}
    {workspace === 'displays' && props.displayScreens
      ? <DisplayScreensPanel {...props.displayScreens} />
      : <ReportsPage {...props} />}
  </Box>;
};
