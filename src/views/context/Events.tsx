import { EventsScreen } from '../../app/views/events/eventsScreen.js';
import React from 'react';

type EventsContextProps = React.ComponentProps<typeof EventsScreen>;

export const EventsContext = (props: EventsContextProps): React.ReactElement => {
  return <EventsScreen {...props} />;
};
