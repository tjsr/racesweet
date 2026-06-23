import React from 'react';
import { SessionsPage } from '../sessions/sessionsPage.js';

type SessionsContextProps = React.ComponentProps<typeof SessionsPage>;

export const SessionsContext = (props: SessionsContextProps): React.ReactElement => {
  return <SessionsPage {...props} />;
};
