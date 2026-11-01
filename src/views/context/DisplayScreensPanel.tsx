import {
  Alert, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import React from 'react';
import type { DisplayComponent, DisplayComponentType, DisplayScreenTemplate, DisplayShareLink } from '../../model/displayScreen.js';
import { validateDisplayLayout } from '../../model/displayScreen.js';
import { createId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type { DisplayProjection } from '../../processing/displayProjection.js';
import { DisplayScreenCanvas } from '../display/DisplayScreenCanvas.js';
import { type EventSessionOption, EventSessionSelector } from '../display/raceAnalyticsViews.js';

export interface DisplayScreensPanelProps {
  categories: Array<{ id: string; name: string }>;
  eventId?: EventId;
  eventSessionOptions: EventSessionOption[];
  links: DisplayShareLink[];
  onArchive: (templateId: string) => Promise<void>;
  onCreate: (name: string) => Promise<string>;
  onCreateLink: (templateId: string, eventId: EventId, sessionId?: SessionId, expiresAt?: string) => Promise<string>;
  onSelectEventSession: (value: string) => void;
  onPublish: (templateId: string) => Promise<void>;
  onRevokeLink: (linkId: string) => Promise<void>;
  onRotateLink: (linkId: string) => Promise<string>;
  onSave: (templateId: string, name: string, items: DisplayComponent[]) => Promise<void>;
  onUnpublish: (templateId: string) => Promise<void>;
  projection?: DisplayProjection;
  sessionId?: SessionId;
  selectedEventSessionValue?: string;
  shareBaseUrl: string;
  templates: DisplayScreenTemplate[];
}

const componentLabels: Record<DisplayComponentType, string> = {
  clock: 'Clock',
  'event-title': 'Event title',
  leaderboard: 'Leaderboard',
  'results-table': 'Results table',
  'sponsor-image': 'Sponsor image',
  'text-panel': 'Text panel',
};

const createComponent = (type: DisplayComponentType, items: DisplayComponent[]): DisplayComponent => {
  const y: number = items.reduce((maximum: number, item: DisplayComponent): number => Math.max(maximum, item.y + item.height), 0);
  const base = { height: 2, id: createId('displayComponentId'), width: 12, x: 0, y, zIndex: 0 };
  switch (type) {
  case 'event-title': return { ...base, settings: { showSession: true }, type };
  case 'clock': return { ...base, settings: { format: 'time', timeZone: 'event' }, type };
  case 'leaderboard':
  case 'results-table': return { ...base, settings: { limit: 10, scope: 'overall' }, type };
  case 'sponsor-image': return { ...base, settings: { alt: '', mediaDataUrl: '' }, type };
  case 'text-panel': return { ...base, settings: { text: 'Text' }, type };
  }
};

const ComponentSettings = ({ categories, component, onChange, onDelete }: {
  categories: DisplayScreensPanelProps['categories'];
  component: DisplayComponent;
  onChange: (next: DisplayComponent) => void;
  onDelete: () => void;
}): React.ReactElement => {
  const updateNumber = (key: 'x' | 'y' | 'width' | 'height' | 'zIndex', value: string): void =>
    onChange({ ...component, [key]: Number(value) });
  return <Stack spacing={1} sx={{ mt: 2 }}>
    <Typography variant="h6">{componentLabels[component.type]} settings</Typography>
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))' }}>
      {(['x', 'y', 'width', 'height', 'zIndex'] as const).map((key): React.ReactElement =>
        <TextField key={key} label={key} type="number" value={component[key]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => updateNumber(key, event.target.value)} />)}
    </Box>
    <FormControlLabel control={<Switch checked={component.layered === true}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({ ...component, layered: event.target.checked })} />}
    label="Allow layering" />
    {component.type === 'event-title' ? <FormControlLabel label="Show session" control={<Switch
      checked={component.settings.showSession}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
        ...component, settings: { showSession: event.target.checked },
      })} />} /> : null}
    {component.type === 'clock' ? <Stack direction={{ sm: 'row', xs: 'column' }} spacing={1}>
      <TextField select label="Clock format" value={component.settings.format}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, format: event.target.value as 'time' | 'date-time' },
        })}><MenuItem value="time">Time</MenuItem><MenuItem value="date-time">Date and time</MenuItem></TextField>
      <TextField select label="Clock timezone" value={component.settings.timeZone}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, timeZone: event.target.value as 'event' | 'local' },
        })}><MenuItem value="event">Event</MenuItem><MenuItem value="local">Viewer local</MenuItem></TextField>
    </Stack> : null}
    {(component.type === 'leaderboard' || component.type === 'results-table') ? <Stack direction={{ sm: 'row', xs: 'column' }} spacing={1}>
      <TextField label="Row limit" type="number" value={component.settings.limit}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, limit: Number(event.target.value) },
        })} />
      <TextField select label="Result scope" value={component.settings.scope}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, scope: event.target.value as 'overall' | 'category' },
        })}><MenuItem value="overall">Overall</MenuItem><MenuItem value="category">Category</MenuItem></TextField>
      {component.settings.scope === 'category' ? <TextField select label="Category" value={component.settings.categoryId || ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, categoryId: event.target.value },
        })}>{categories.map((category): React.ReactElement => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}</TextField> : null}
    </Stack> : null}
    {component.type === 'text-panel' ? <TextField label="Text" multiline minRows={3}
      value={component.settings.text} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
        ...component, settings: { text: event.target.value },
      })} /> : null}
    {component.type === 'sponsor-image' ? <Stack spacing={1}>
      <TextField label="Alternative text" value={component.settings.alt}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, alt: event.target.value },
        })} />
      <TextField label="Image data URL (PNG, JPEG, or WebP)" value={component.settings.mediaDataUrl}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({
          ...component, settings: { ...component.settings, mediaDataUrl: event.target.value },
        })} />
    </Stack> : null}
    <Button color="error" onClick={onDelete}>Delete component</Button>
  </Stack>;
};

export const DisplayScreensPanel = (props: DisplayScreensPanelProps): React.ReactElement => {
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('');
  const [newName, setNewName] = React.useState<string>('');
  const [draftName, setDraftName] = React.useState<string>('');
  const [draftItems, setDraftItems] = React.useState<DisplayComponent[]>([]);
  const [history, setHistory] = React.useState<DisplayComponent[][]>([]);
  const [selectedItemId, setSelectedItemId] = React.useState<string>('');
  const [paletteType, setPaletteType] = React.useState<DisplayComponentType>('event-title');
  const [bindSession, setBindSession] = React.useState<boolean>(true);
  const [linkExpiry, setLinkExpiry] = React.useState<string>('');
  const [lastLink, setLastLink] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [busy, setBusy] = React.useState<boolean>(false);
  const template: DisplayScreenTemplate | undefined = props.templates.find(
    (candidate: DisplayScreenTemplate): boolean => candidate.id === selectedTemplateId && !candidate.archived,
  );
  React.useEffect((): void => {
    if (template) {
      setDraftName(template.name);
      setDraftItems(structuredClone(template.draft.items));
      setHistory([]);
      setSelectedItemId('');
    }
  }, [template?.id, template?.draft.revision]);
  const selectedItem: DisplayComponent | undefined = draftItems.find((item: DisplayComponent): boolean => item.id === selectedItemId);
  const dirty: boolean = !!template && (draftName !== template.name || JSON.stringify(draftItems) !== JSON.stringify(template.draft.items));
  let layoutError: string = '';
  try {
    validateDisplayLayout(draftItems); 
  } catch (failure: unknown) {
    layoutError = failure instanceof Error ? failure.message : String(failure);
  }
  const changeItems = (next: DisplayComponent[]): void => {
    setHistory((current: DisplayComponent[][]): DisplayComponent[][] => [...current, draftItems]);
    setDraftItems(next);
  };
  const run = (operation: () => Promise<void>): void => {
    setBusy(true);
    setError('');
    void operation().catch((failure: unknown): void => {
      setError(failure instanceof Error ? failure.message : String(failure));
    }).finally((): void => setBusy(false));
  };
  const updateSelected = (next: DisplayComponent): void => changeItems(
    draftItems.map((item: DisplayComponent): DisplayComponent => item.id === next.id ? next : item),
  );
  const createLink = (): Promise<void> => {
    const expiry: Date | undefined = linkExpiry ? new Date(linkExpiry) : undefined;
    if (expiry && Number.isNaN(expiry.getTime())) {
      return Promise.reject(new Error('Enter a valid link expiry.'));
    }
    return props.onCreateLink(
      template!.id, props.eventId!, bindSession ? props.sessionId : undefined, expiry?.toISOString(),
    ).then((token: string): void => setLastLink(`${props.shareBaseUrl.replace(/\/$/u, '')}/display/${token}`));
  };
  const getLinkBindingLabel = (link: DisplayShareLink): string => {
    const event: EventSessionOption | undefined = props.eventSessionOptions.find(
      (option: EventSessionOption): boolean => option.eventId === link.eventId && !option.sessionId,
    );
    const session: EventSessionOption | undefined = props.eventSessionOptions.find(
      (option: EventSessionOption): boolean => option.eventId === link.eventId && option.sessionId === link.sessionId,
    );
    return `${event?.eventName || 'Event'}${link.sessionId ? ` / ${session?.sessionName || 'Unavailable session'}` : ''}`;
  };
  const published: boolean = template?.publishedRevision !== undefined;
  return <Box component="section" sx={{ '& button': { minHeight: 48 }, minWidth: 0 }} aria-label="Display Screens">
    <Typography variant="h4" gutterBottom>Display Screens</Typography>
    <Typography sx={{ mb: 2 }}>Templates can be reused with any session. Choose a session to preview
      its data and create a share link.</Typography>
    <Box sx={{ maxWidth: 420, mb: 2 }}><EventSessionSelector label="Preview event/session"
      options={props.eventSessionOptions} onSelectEventSession={props.onSelectEventSession}
      selectedValue={props.selectedEventSessionValue} /></Box>
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', mb: 2 }}>
      <TextField label="New screen name" value={newName}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setNewName(event.target.value)} />
      <Button variant="contained" disabled={!newName.trim() || busy} onClick={(): void => run(() =>
        props.onCreate(newName).then((id: string): void => {
          setSelectedTemplateId(id);
          setNewName('');
        }))}>Create screen</Button>
      <TextField select label="Screen template" value={selectedTemplateId}
        slotProps={{ select: { 'aria-label': 'Display screen template' } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSelectedTemplateId(event.target.value)}
        sx={{ minWidth: 220 }}><MenuItem value="">Choose screen</MenuItem>
        {props.templates.filter((candidate: DisplayScreenTemplate): boolean => !candidate.archived)
          .map((candidate: DisplayScreenTemplate): React.ReactElement =>
            <MenuItem key={candidate.id} value={candidate.id}>{candidate.name}</MenuItem>)}</TextField>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
    {template ? <>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', mb: 2 }}>
        <TextField label="Screen name" value={draftName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setDraftName(event.target.value)} />
        <TextField select label="Add component" value={paletteType}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setPaletteType(event.target.value as DisplayComponentType)}>
          {(Object.keys(componentLabels) as DisplayComponentType[]).map((type: DisplayComponentType): React.ReactElement =>
            <MenuItem key={type} value={type}>{componentLabels[type]}</MenuItem>)}</TextField>
        <Button onClick={(): void => {
          const next: DisplayComponent = createComponent(paletteType, draftItems);
          changeItems([...draftItems, next]);
          setSelectedItemId(next.id);
        }}>Add</Button>
        <Button disabled={history.length === 0} onClick={(): void => {
          setDraftItems(history.at(-1)!);
          setHistory(history.slice(0, -1));
        }}>Undo</Button>
      </Box>
      {layoutError ? <Alert severity="warning" sx={{ mb: 1 }}>{layoutError}</Alert> : null}
      {props.projection ? <Box sx={{ minWidth: 0, overflowX: 'auto', width: '100%' }}>
        <DisplayScreenCanvas items={draftItems} projection={props.projection}
          onSelect={setSelectedItemId} selectedId={selectedItemId} />
      </Box> : <Typography>Choose an event and session to preview.</Typography>}
      {selectedItem ? <ComponentSettings categories={props.categories} component={selectedItem}
        onChange={updateSelected} onDelete={(): void => {
          changeItems(draftItems.filter((item: DisplayComponent): boolean => item.id !== selectedItem.id));
          setSelectedItemId('');
        }} /> : null}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
        <Button variant="contained" disabled={!dirty || !!layoutError || busy}
          onClick={(): void => run(() => props.onSave(template.id, draftName, draftItems))}>Save draft</Button>
        <Button disabled={dirty || draftItems.length === 0 || busy}
          onClick={(): void => run(() => props.onPublish(template.id))}>Publish</Button>
        <Button disabled={!published || busy}
          onClick={(): void => run(() => props.onUnpublish(template.id))}>Unpublish</Button>
        <Button color="error" disabled={busy}
          onClick={(): void => run(() => props.onArchive(template.id))}>Archive</Button>
      </Box>
      <Typography sx={{ mt: 2 }}>Published revision: {template.publishedRevision ?? 'none'}</Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', mt: 2 }}>
        <FormControlLabel control={<Switch checked={bindSession}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setBindSession(event.target.checked)} />}
        label="Bind selected session" />
        <TextField label="Link expires (optional)" type="datetime-local" value={linkExpiry}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setLinkExpiry(event.target.value)} />
        <Button disabled={!published || !props.eventId || !props.shareBaseUrl || (bindSession && !props.sessionId) || busy}
          onClick={(): void => run(createLink)}>
          Create share link
        </Button>
      </Box>
      {lastLink ? <Alert severity="success" sx={{ mt: 1 }}>Copy this link now: {lastLink}</Alert> : null}
      {props.links.filter((link: DisplayShareLink): boolean => link.templateId === template.id && link.active)
        .map((link: DisplayShareLink): React.ReactElement => <Stack key={link.id}
          direction={{ sm: 'row', xs: 'column' }} spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
          <Typography sx={{ flexGrow: 1, minWidth: 0 }}>
            {getLinkBindingLabel(link)} · revision {link.revision}
            {link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleString()}` : ''}
          </Typography>
          <Button disabled={busy} onClick={(): void => run(() => props.onRotateLink(link.id)
            .then((token: string): void => setLastLink(`${props.shareBaseUrl.replace(/\/$/u, '')}/display/${token}`)))}>Rotate</Button>
          <Button color="error" disabled={busy} onClick={(): void => run(() => props.onRevokeLink(link.id))}>Revoke</Button>
        </Stack>)}
    </> : null}
  </Box>;
};
