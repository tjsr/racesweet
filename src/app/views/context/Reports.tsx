import React from 'react';
import { ReportsPage } from '../reports/reportsPage.js';

type ReportsContextProps = React.ComponentProps<typeof ReportsPage>;

export const ReportsContext = (props: ReportsContextProps): React.ReactElement => {
  return <ReportsPage {...props} />;
};
