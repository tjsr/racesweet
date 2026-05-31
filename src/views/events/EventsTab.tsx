import React, { useState } from 'react';
import type { ImportedEventData } from '../../controllers/apicalImport.ts';
import type { RaceEvent } from '../../model/raceevent.ts';
import type { EventId } from '../../model/types.ts';
import type { RaceState } from '../../model/racestate.ts';
import { ImportEventsModal } from './ImportEventsModal.tsx';

interface EventsTabProps {
  initialEvents?: RaceEvent[];
}

export const EventsTab = ({ initialEvents = [] }: EventsTabProps) => {
  const [events, setEvents] = useState<RaceEvent[]>(initialEvents);
  const [eventData, setEventData] = useState<Map<EventId, Partial<RaceState>>>(new Map());
  const [isModalOpen, setModalOpen] = useState(false);

  const handleImportComplete = (imported: ImportedEventData[]) => {
    const existingIds = new Set(events.map((e) => e.apicalId));
    const newEvents = imported
      .map((d) => d.event)
      .filter((e) => !existingIds.has(e.apicalId));

    if (newEvents.length > 0) {
      setEvents((prev) => [...prev, ...newEvents]);
      setEventData((prev) => {
        const next = new Map(prev);
        imported.forEach(({ event, raceState }) => {
          next.set(event.id, raceState);
        });
        return next;
      });
    }

    setModalOpen(false);
  };

  return (
    <div className="events-tab">
      <div className="events-toolbar">
        <h2>Events</h2>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          Import Events
        </button>
      </div>

      {events.length === 0 ? (
        <p className="empty-message">No events loaded. Use &ldquo;Import Events&rdquo; to get started.</p>
      ) : (
        <table className="events-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Date</th>
              <th>Company</th>
              <th>Categories</th>
              <th>Participants</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const data = eventData.get(event.id);
              return (
                <tr key={event.id}>
                  <td>{event.name}</td>
                  <td>{new Date(event.date).toLocaleDateString()}</td>
                  <td>{event.companyName}</td>
                  <td>{data?.categories?.length ?? '—'}</td>
                  <td>{data?.participants?.length ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isModalOpen && (
        <ImportEventsModal
          existingEvents={events}
          onImportComplete={handleImportComplete}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
};
