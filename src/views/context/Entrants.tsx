import { EntrantsPage } from '../../app/views/entrants/entrantsPage.js';
import React from 'react';

type EntrantsContextProps = React.ComponentProps<typeof EntrantsPage>;

export const EntrantsContext = (props: EntrantsContextProps): React.ReactElement => {
  return <EntrantsPage {...props} />;
};
