import React from 'react';
import { ResultsPage } from '../../app/views/results/resultsPage.js';

type ResultsContextProps = React.ComponentProps<typeof ResultsPage>;

export const ResultsContext = (props: ResultsContextProps): React.ReactElement => {
  return <ResultsPage {...props} />;
};
