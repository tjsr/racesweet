import React from 'react';
import { type EventCatalogEntrant } from '../../app/eventCatalog.js';

interface EntrantsInCategoryPanelProps {
  entrants: EventCatalogEntrant[];
}

export const EntrantsInCategoryPanel = (props: EntrantsInCategoryPanelProps): React.ReactElement => {
  const teamEntrants = props.entrants.filter((entrant) => entrant.entrantType === 'team');
  const riderEntrants = props.entrants.filter((entrant) => entrant.entrantType === 'rider');
  const individualEntrants = riderEntrants.filter((entrant) => !entrant.teamEntrantId);

  return (
    <section className="events-panel">
      <h2>Entrants In Category</h2>
      {props.entrants.length > 0 ? (
        <div className="entrant-summary-list">
          {teamEntrants.length > 0 ? (
            <section>
              <h3>Teams</h3>
              <ul>
                {teamEntrants.map((team) => {
                  const teamMembers = riderEntrants.filter((entrant) => entrant.teamEntrantId === team.id);
                  return (
                    <li key={team.id}>
                      <strong>{team.name}</strong>
                      {teamMembers.length > 0 ? (
                        <ul>
                          {teamMembers.map((member) => (
                            <li key={member.id}>{member.name}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {individualEntrants.length > 0 ? (
            <section>
              <h3>Individual Entrants</h3>
              <ul>
                {individualEntrants.map((entrant) => (
                  <li key={entrant.id}>{entrant.name}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <p>No entrants are currently assigned to this category.</p>
      )}
    </section>
  );
};
