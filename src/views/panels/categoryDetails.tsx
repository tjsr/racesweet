import React from 'react';
import { type CategoryDistanceRule, type EventCatalogCategory } from '../../catalog/eventCatalog.js';
import { type SessionId } from '../../model/raceevent.js';
import { type CategoryDraft } from '../display/categoriesPage.js';

interface CategoryDetailsPanelProps {
  categoryDraft: CategoryDraft;
  eventSessions: Array<{ id: SessionId; name: string; scheduledStart: string }>;
  formError?: string;
  onDeleteCategory: () => void | Promise<void>;
  onSaveCategory: () => void | Promise<void>;
  onSetCategoryDraft: React.Dispatch<React.SetStateAction<CategoryDraft>>;
  selectedCategory?: EventCatalogCategory;
  warningModal?: React.ReactNode;
}

export const CategoryDetailsPanel = (props: CategoryDetailsPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Category Details</h2>
    {props.selectedCategory ? (
      <>
        <label>
          Category Name
          <input
            aria-label="Category Name"
            type="text"
            value={props.categoryDraft.name}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          Category Code
          <input
            aria-label="Category Code"
            type="text"
            value={props.categoryDraft.code}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, code: event.target.value }))}
          />
        </label>
        <label>
          Description
          <textarea
            aria-label="Category Description"
            value={props.categoryDraft.description}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, description: event.target.value }))}
          />
        </label>
        <label>
          <input
            aria-label="Category Exclude From Results"
            type="checkbox"
            checked={props.categoryDraft.excludeFromResults}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, excludeFromResults: event.target.checked }))}
          />
          Exclude from results
        </label>
        <label>
          <input
            aria-label="Category Is Placeholder"
            type="checkbox"
            checked={props.categoryDraft.isPlaceholder}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, isPlaceholder: event.target.checked }))}
          />
          Placeholder category
        </label>
        <label>
          Distance Type
          <select
            aria-label="Category Distance Rule Type"
            value={props.categoryDraft.distanceRuleKind}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, distanceRuleKind: event.target.value as CategoryDistanceRule['kind'] }))}
          >
            <option value="unspecified">Unspecified</option>
            <option value="time">Time</option>
            <option value="laps">Laps</option>
          </select>
        </label>
        {props.categoryDraft.distanceRuleKind !== 'unspecified' ? (
          <label>
            Distance Value
            <input
              aria-label="Category Distance Rule Value"
              type="text"
              value={props.categoryDraft.distanceRuleValue}
              onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, distanceRuleValue: event.target.value }))}
              placeholder={props.categoryDraft.distanceRuleKind === 'time' ? '45 or 1:30' : '12'}
            />
          </label>
        ) : null}
        <label>
          Entrant Identity
          <select
            aria-label="Category Entrant Identity"
            value={props.categoryDraft.identityMode}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, identityMode: event.target.value as 'single' | 'multiple' }))}
          >
            <option value="single">Single identity</option>
            <option value="multiple">Multiple identity</option>
          </select>
        </label>
        <label>
          Max Team Size
          <input
            aria-label="Category Max Team Size"
            type="number"
            value={props.categoryDraft.maxTeamSize}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, maxTeamSize: event.target.value }))}
          />
        </label>
        <label>
          Minimum Rider Age
          <input
            aria-label="Category Min Rider Age"
            type="number"
            value={props.categoryDraft.minRiderAge}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, minRiderAge: event.target.value }))}
          />
        </label>
        <label>
          Maximum Rider Age
          <input
            aria-label="Category Max Rider Age"
            type="number"
            value={props.categoryDraft.maxRiderAge}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, maxRiderAge: event.target.value }))}
          />
        </label>
        <label>
          Team Gender Rules
          <textarea
            aria-label="Category Team Gender Rules"
            value={props.categoryDraft.teamCompositionRules}
            onChange={(event) => props.onSetCategoryDraft((current) => ({ ...current, teamCompositionRules: event.target.value }))}
            placeholder="female:1:2; male:1:3"
          />
        </label>
        <label>
          Session Assignments
          <select
            aria-label="Category Session Assignments"
            multiple
            value={props.categoryDraft.sessionIds}
            onChange={(event) => {
              const sessionIds = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
              props.onSetCategoryDraft((current) => ({ ...current, sessionIds }));
            }}
          >
            {props.eventSessions.map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
        </label>
        <div className="events-actions">
          <div className="category-save-status">
            <button type="button" onClick={() => props.onSaveCategory()}>
              Save Category
            </button>
            {props.formError ? (
              <div className="error category-save-error" role="alert">
                <span className="warning-icon" aria-hidden="true">!</span>
                <p>{props.formError}</p>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={() => props.onDeleteCategory()}>
            Delete Category
          </button>
          <span className="category-id-display">Category ID: {props.selectedCategory.id.toString()}</span>
        </div>
        {props.warningModal}
      </>
    ) : (
      <p>No categories are defined for this event.</p>
    )}
  </section>
);
