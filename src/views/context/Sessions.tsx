import React from 'react';
import { SessionsPage } from '../../app/views/sessions/sessionsPage.js';

type SessionsContextProps = React.ComponentProps<typeof SessionsPage>;

export const SessionsContext = (props: SessionsContextProps): React.ReactElement => {
  return <SessionsPage {...props} />;
};
