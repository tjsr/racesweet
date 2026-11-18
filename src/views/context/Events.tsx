import React from 'react';

import { EventsScreen } from '../../app/views/events/eventsScreen.js';

type EventsContextProps = React.ComponentProps<typeof EventsScreen>;

export const EventsContext = (props: EventsContextProps): React.ReactElement => {
  return <EventsScreen {...props} />;
};
