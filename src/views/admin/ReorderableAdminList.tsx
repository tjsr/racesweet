import React from 'react';
import { Alert, Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';

export interface ReorderableAdminListProps<TItem> {
  getId: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  items: readonly TItem[];
  label: string;
  onReorder: (items: TItem[]) => void | Promise<void>;
  renderItem: (item: TItem, index: number) => React.ReactNode;
}

const moveItem = <TItem,>(items: readonly TItem[], from: number, to: number): TItem[] => {
  const next: TItem[] = [...items];
  const moved: TItem | undefined = next.splice(from, 1)[0];
  if (moved !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
};

/** Pointer events cover mouse, pen and touch; keyboard and buttons provide equivalent actions. */
export const ReorderableAdminList = <TItem,>(props: ReorderableAdminListProps<TItem>): React.ReactElement => {
  const [preview, setPreview] = React.useState<TItem[] | undefined>(undefined);
  const [announcement, setAnnouncement] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [pending, setPending] = React.useState<boolean>(false);
  const movingId: React.RefObject<string | undefined> = React.useRef<string | undefined>(undefined);
  const previewRef: React.RefObject<TItem[] | undefined> = React.useRef<TItem[] | undefined>(undefined);
  const list: TItem[] = preview || [...props.items];
  const reset = (): void => {
    movingId.current = undefined;
    previewRef.current = undefined;
    setPreview(undefined);
  };
  React.useEffect(reset, [props.items]);
  const save = (next: TItem[]): void => {
    setError('');
    setPending(true);
    setPreview(next);
    Promise.resolve().then((): void | Promise<void> => props.onReorder(next)).then((): void => {
      setAnnouncement('Order saved.');
    }).catch((failure: unknown): void => {
      setPreview(undefined);
      setError(failure instanceof Error ? failure.message : 'Unable to save order.');
      setAnnouncement('Reordering failed. The previous order has been restored.');
    }).finally((): void => setPending(false));
  };
  const lift = (item: TItem): void => {
    movingId.current = props.getId(item);
    previewRef.current = [...list];
    setAnnouncement(`${props.getLabel(item)} picked up. Use arrow keys to move, Enter to drop, Escape to cancel.`);
  };
  const move = (to: number): void => {
    const current: TItem[] = previewRef.current || list;
    const from: number = current.findIndex((item: TItem): boolean => props.getId(item) === movingId.current);
    if (from < 0 || to < 0 || to >= current.length) return;
    const next: TItem[] = moveItem(current, from, to);
    previewRef.current = next;
    setPreview(next);
    setAnnouncement(`Position ${to + 1} of ${next.length}.`);
  };
  const drop = (): void => {
    if (!movingId.current) return;
    movingId.current = undefined;
    save(previewRef.current || list);
  };
  const cancel = (): void => {
    reset();
    setAnnouncement('Reordering cancelled.');
  };
  const keyboard = (event: React.KeyboardEvent<HTMLButtonElement>, item: TItem, index: number): void => {
    if (event.key === ' ' && !movingId.current) {
      event.preventDefault(); lift(item); 
    } else if (movingId.current && ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') cancel();
      else if (event.key === 'Enter' || event.key === ' ') drop();
      else move(index + (event.key === 'ArrowUp' ? -1 : 1));
    }
  };
  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (!movingId.current || !document.elementFromPoint) return;
    const hit: Element | null = document.elementFromPoint(event.clientX, event.clientY);
    const targetId: string | null | undefined = hit?.closest('[data-reorder-id]')?.getAttribute('data-reorder-id');
    const targetIndex: number = list.findIndex((item: TItem): boolean => props.getId(item) === targetId);
    if (targetIndex >= 0) move(targetIndex);
  };
  return <Stack aria-label={props.label} aria-busy={pending || undefined} spacing={1} role="list">
    <Typography variant="body2">Drag the handle, or press Space then arrow keys and Enter. Move buttons work on every device.</Typography>
    {list.map((item: TItem, index: number): React.ReactElement => <Box key={props.getId(item)} data-reorder-id={props.getId(item)}
      role="listitem" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0, p: 1 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 600 }} variant="body2">Order</Typography>
        <Tooltip title={`Reorder ${props.getLabel(item)}`}><IconButton aria-label={`Reorder ${props.getLabel(item)}`}
          disabled={pending} onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>): void => keyboard(event, item, index)}
          onPointerCancel={cancel} onPointerDown={(event: React.PointerEvent<HTMLButtonElement>): void => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            lift(item);
          }} onPointerMove={pointerMove} onPointerUp={drop} sx={{ minHeight: 48, minWidth: 48, touchAction: 'none' }}>↕</IconButton></Tooltip>
        <Tooltip title={`Move ${props.getLabel(item)} up`}><span><IconButton aria-label={`Move ${props.getLabel(item)} up`}
          disabled={pending || index === 0} onClick={(): void => save(moveItem(list, index, index - 1))}
          sx={{ minHeight: 48, minWidth: 48 }}>↑</IconButton></span></Tooltip>
        <Tooltip title={`Move ${props.getLabel(item)} down`}><span><IconButton aria-label={`Move ${props.getLabel(item)} down`}
          disabled={pending || index === list.length - 1} onClick={(): void => save(moveItem(list, index, index + 1))}
          sx={{ minHeight: 48, minWidth: 48 }}>↓</IconButton></span></Tooltip>
      </Stack>
      {props.renderItem(item, index)}
    </Box>)}
    <Typography aria-live="polite" role="status">{announcement}</Typography>
    {error && <Alert severity="error">{error}</Alert>}
  </Stack>;
};
