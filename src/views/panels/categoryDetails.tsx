import { Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import { type CategoryDistanceRule, type EventCatalogCategory } from '../../catalog/eventCatalog.js';
import { NumericInput } from '../../controls/numericInput.js';
import { type SessionId } from '../../model/raceevent.js';
import { type CategoryDraft } from '../display/categoriesPage.js';

interface CategoryDetailsPanelProps { categoryDraft: CategoryDraft; deleteError?: string; deleteStatus: 'idle' | 'pending' | 'succeeded' | 'failed'; eventSessions: Array<{ id: SessionId; name: string; scheduledStart: string }>; formError?: string; onDeleteCategory: () => void | Promise<void>; onSaveCategory: () => void | Promise<void>; onSetCategoryDraft: React.Dispatch<React.SetStateAction<CategoryDraft>>; selectedCategory?: EventCatalogCategory; warningModal?: React.ReactNode; }

export const CategoryDetailsPanel = (props: CategoryDetailsPanelProps): React.ReactElement => {
  const update = <TKey extends keyof CategoryDraft>(key: TKey, value: CategoryDraft[TKey]): void => props.onSetCategoryDraft((current) => ({ ...current, [key]: value }));
  return <section className="events-panel"><h2>Category Details</h2>{props.selectedCategory ? <>
    <TextField fullWidth label="Category Name" slotProps={{ htmlInput: { 'aria-label': 'Category Name' } }} value={props.categoryDraft.name} onChange={(event) => update('name', event.target.value)} />
    <TextField fullWidth label="Category Code" slotProps={{ htmlInput: { 'aria-label': 'Category Code' } }} value={props.categoryDraft.code} onChange={(event) => update('code', event.target.value)} />
    <TextField fullWidth label="Description" multiline slotProps={{ htmlInput: { 'aria-label': 'Category Description' } }} value={props.categoryDraft.description} onChange={(event) => update('description', event.target.value)} />
    <TextField fullWidth label="Calculate elapsed time from" select slotProps={{ select: { 'aria-label': 'Category Calculate Elapsed Time From', native: true } }} value={props.categoryDraft.elapsedTimeCalculation} onChange={(event) => update('elapsedTimeCalculation', event.target.value)}><option value="">Inherit session/event</option><option value="first-start">First start</option><option value="category-start">Category start</option></TextField>
    <TextField fullWidth label="Calculate lap 1 from" select slotProps={{ select: { 'aria-label': 'Category Calculate Lap 1 From', native: true } }} value={props.categoryDraft.lap1Calculation} onChange={(event) => update('lap1Calculation', event.target.value)}><option value="">Inherit session/event</option><option value="first-start">First start</option><option value="category-start">Category start</option></TextField>
    <FormControlLabel control={<Checkbox checked={props.categoryDraft.excludeFromResults} slotProps={{ input: { 'aria-label': 'Category Exclude From Results' } }} onChange={(event) => update('excludeFromResults', event.target.checked)} />} label="Exclude from results" />
    <FormControlLabel control={<Checkbox checked={props.categoryDraft.isPlaceholder} slotProps={{ input: { 'aria-label': 'Category Is Placeholder' } }} onChange={(event) => update('isPlaceholder', event.target.checked)} />} label="Placeholder category" />
    <TextField fullWidth label="Distance Type" select slotProps={{ select: { 'aria-label': 'Category Distance Rule Type', native: true } }} value={props.categoryDraft.distanceRuleKind} onChange={(event) => update('distanceRuleKind', event.target.value as CategoryDistanceRule['kind'])}><option value="unspecified">Unspecified</option><option value="time">Time</option><option value="laps">Laps</option></TextField>
    {props.categoryDraft.distanceRuleKind !== 'unspecified' ? <TextField fullWidth label="Distance Value" placeholder={props.categoryDraft.distanceRuleKind === 'time' ? '45 or 1:30' : '12'} slotProps={{ htmlInput: { 'aria-label': 'Category Distance Rule Value' } }} value={props.categoryDraft.distanceRuleValue} onChange={(event) => update('distanceRuleValue', event.target.value)} /> : null}
    <TextField fullWidth label="Entrant Identity" select slotProps={{ select: { 'aria-label': 'Category Entrant Identity', native: true } }} value={props.categoryDraft.identityMode} onChange={(event) => update('identityMode', event.target.value as 'single' | 'multiple')}><option value="single">Single identity</option><option value="multiple">Multiple identity</option></TextField>
    <Stack spacing={1}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography component="label" htmlFor="category-max-team-size">Max Team Size</Typography>
        <NumericInput ariaLabel="Category Max Team Size" id="category-max-team-size" onChange={(value) => update('maxTeamSize', value)} value={props.categoryDraft.maxTeamSize} />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography component="label" htmlFor="category-min-rider-age">Minimum Rider Age</Typography>
        <NumericInput ariaLabel="Category Min Rider Age" id="category-min-rider-age" onChange={(value) => update('minRiderAge', value)} value={props.categoryDraft.minRiderAge} />
      </Stack>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography component="label" htmlFor="category-max-rider-age">Maximum Rider Age</Typography>
        <NumericInput ariaLabel="Category Max Rider Age" id="category-max-rider-age" onChange={(value) => update('maxRiderAge', value)} value={props.categoryDraft.maxRiderAge} />
      </Stack>
    </Stack>
    <TextField fullWidth label="Team Gender Rules" multiline placeholder="female:1:2; male:1:3" slotProps={{ htmlInput: { 'aria-label': 'Category Team Gender Rules' } }} value={props.categoryDraft.teamCompositionRules} onChange={(event) => update('teamCompositionRules', event.target.value)} />
    <TextField fullWidth label="Session Assignments" select slotProps={{ select: { 'aria-label': 'Category Session Assignments', multiple: true, native: true } }} value={props.categoryDraft.sessionIds.filter((sessionId) => props.eventSessions.some((session) => session.id === sessionId))} onChange={(event) => update('sessionIds', Array.from((event.target as unknown as HTMLSelectElement).selectedOptions).map((option) => option.value))}>{props.eventSessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</TextField>
    <div className="events-actions"><div className="category-save-status"><Button onClick={() => props.onSaveCategory()} variant="contained">Save Category</Button>{props.formError ? <div className="error category-save-error" role="alert"><span className="warning-icon" aria-hidden="true">!</span><p>{props.formError}</p></div> : null}</div><div className="category-delete-status"><Button color="error" disabled={props.deleteStatus === 'pending'} endIcon={props.deleteStatus === 'pending' ? <CircularProgress aria-label="Deleting category" size={16} /> : props.deleteStatus === 'succeeded' ? <span aria-label="Category deleted" role="img">✓</span> : props.deleteStatus === 'failed' ? <span aria-label="Category deletion failed" role="img">!</span> : undefined} onClick={() => props.onDeleteCategory()} variant="outlined">Delete Category</Button>{props.deleteError ? <span className="error category-delete-error" role="alert">{props.deleteError}</span> : null}</div><span className="category-id-display">Category ID: {props.selectedCategory.id.toString()}</span></div>{props.warningModal}
  </> : <p>No categories are defined for this event.</p>}</section>;
};
