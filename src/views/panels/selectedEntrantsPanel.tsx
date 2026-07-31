import { Button, CircularProgress } from '@mui/material';
import React from 'react';
import { type EventCatalogCategory, type EventCatalogEntrant } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';

interface SelectedEntrantsPanelProps {
  categories: EventCatalogCategory[];
  deleteError?: string;
  deleteStatus: 'idle' | 'pending' | 'succeeded' | 'failed';
  onDeleteSelected: () => void | Promise<void>;
  onMoveToCategory: (categoryId: string) => void | Promise<void>;
  onRemoveFromCategory: (categoryId: string) => void | Promise<void>;
  selectedEntrants: EventCatalogEntrant[];
}

const getEntrantCategoryIds = (entrant: EventCatalogEntrant): string[] => Array.from(new Set([
  entrant.categoryId?.toString(),
  ...entrant.categoryIds.map((categoryId) => categoryId.toString()),
].filter((categoryId): categoryId is string => !!categoryId)));

export const SelectedEntrantsPanel = (props: SelectedEntrantsPanelProps): React.ReactElement => {
  const selectedCategoryIds = new Set(props.selectedEntrants.flatMap(getEntrantCategoryIds));
  const removableCategories = props.categories.filter((category) => selectedCategoryIds.has(category.id.toString()));

  return <section className="events-panel">
    <h2>Selected Entrants</h2>
    <ul className="readonly-summary-list">
      {props.selectedEntrants.map((entrant) => <li key={entrant.id}>{entrant.name} ({entrant.entrantType})</li>)}
    </ul>
    <SelectTextField
      fullWidth
      label="Move to category"
      slotProps={{ select: { 'aria-label': 'Move selected entrants to category', native: true } }}
      value=""
      onChange={(event) => {
        if (event.target.value) {
          void props.onMoveToCategory(event.target.value);
        }
      }}
    >
      <option value="">Select a category</option>
      {props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </SelectTextField>
    <SelectTextField
      disabled={removableCategories.length === 0}
      fullWidth
      label="Remove from category"
      slotProps={{ select: { 'aria-label': 'Remove selected entrants from category', native: true } }}
      value=""
      onChange={(event) => {
        if (event.target.value) {
          void props.onRemoveFromCategory(event.target.value);
        }
      }}
    >
      <option value="">Select a category</option>
      {removableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
    </SelectTextField>
    <div className="entrant-delete-status">
      <Button
        color="error"
        disabled={props.deleteStatus === 'pending'}
        endIcon={props.deleteStatus === 'pending' ? <CircularProgress aria-label="Deleting selected entrants" size={16} /> : props.deleteStatus === 'succeeded' ? <span aria-label="Selected entrants deleted" role="img">✓</span> : props.deleteStatus === 'failed' ? <span aria-label="Selected entrant deletion failed" role="img">!</span> : undefined}
        onClick={props.onDeleteSelected}
        variant="outlined"
      >
        Delete all selected
      </Button>
      {props.deleteError ? <span className="error entrant-delete-error" role="alert">{props.deleteError}</span> : null}
    </div>
  </section>;
};
