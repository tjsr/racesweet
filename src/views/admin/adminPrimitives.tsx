import React from 'react';
import {
  Alert, Autocomplete, type AutocompleteRenderInputParams, Box, Button, Checkbox, Dialog, type DialogProps, FormControlLabel,
  MenuItem, Stack, TextField, type TextFieldProps,
  type Theme, ThemeProvider, Typography, createTheme, useMediaQuery,
} from '@mui/material';

export const ADMIN_BREAKPOINTS: Readonly<{ phone: number; desktop: number }> = { desktop: 960, phone: 600 };

export const adminTheme: Theme = createTheme({
  breakpoints: { values: { lg: 1280, md: ADMIN_BREAKPOINTS.desktop, sm: ADMIN_BREAKPOINTS.phone, xl: 1920, xs: 0 } },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 48, minWidth: 48 } } },
    MuiFormControlLabel: { styleOverrides: { root: { minHeight: 48 } } },
    MuiIconButton: { styleOverrides: { root: { minHeight: 48, minWidth: 48 } } },
    MuiInputBase: { styleOverrides: { input: { fontSize: 16 } } },
    MuiMenuItem: { styleOverrides: { root: { minHeight: 48 } } },
  },
});

export const AdminThemeProvider = (props: { children: React.ReactNode }): React.ReactElement => {
  const dark: boolean = useMediaQuery('(prefers-color-scheme: dark)');
  const theme: Theme = React.useMemo((): Theme => createTheme(adminTheme, { palette: { mode: dark ? 'dark' : 'light' } }), [dark]);
  return <ThemeProvider theme={theme}>{props.children}</ThemeProvider>;
};

export interface AdminOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface AdminMasterDetailLayoutProps {
  detail: React.ReactNode;
  detailLabel?: string;
  list: React.ReactNode;
  listLabel?: string;
  onBack: () => void;
  selectedId?: string;
}

/** Both panes stay mounted so viewport and Back transitions preserve drafts. */
export const AdminMasterDetailLayout = (props: AdminMasterDetailLayoutProps): React.ReactElement => {
  const desktop: boolean = useMediaQuery(adminTheme.breakpoints.up('md'), { defaultMatches: true });
  const [showDetail, setShowDetail] = React.useState<boolean>(false);
  const previousId: React.RefObject<string | undefined> = React.useRef<string | undefined>(props.selectedId);
  React.useEffect((): void => {
    if (props.selectedId !== previousId.current) setShowDetail(Boolean(props.selectedId));
    previousId.current = props.selectedId;
  }, [props.selectedId]);
  const back = (): void => {
    props.onBack();
    setShowDetail(false);
  };
  return <Box className="admin-master-detail" sx={{ display: 'grid', gap: 2,
    gridTemplateColumns: { md: 'minmax(230px, 0.35fr) minmax(0, 1fr)', xs: 'minmax(0, 1fr)' }, minWidth: 0 }}>
    <Box aria-label={props.listLabel || 'Administration list'} hidden={!desktop && showDetail} sx={{ minWidth: 0 }}>
      {props.list}
      {!desktop && props.selectedId && <Button onClick={(): void => setShowDetail(true)} sx={{ minHeight: 48 }}>
        Open {props.detailLabel || 'details'}
      </Button>}
    </Box>
    <Box aria-label={props.detailLabel || 'Administration details'} hidden={!desktop && !showDetail} sx={{ minWidth: 0, pb: { md: 0, xs: 2 } }}>
      {!desktop && <Button onClick={back} sx={{ minHeight: 48 }}>Back to {props.listLabel || 'list'}</Button>}
      {props.detail}
    </Box>
  </Box>;
};

/** Adapts existing list/detail compositions while preserving the mounted panes. */
export const AdminPageLayout = (props: {
  children: React.ReactNode;
  className?: string;
  detailLabel: string;
  listLabel: string;
  selectedId?: string;
}): React.ReactElement => {
  const panes: React.ReactNode[] = React.Children.toArray(props.children);
  const [openedId, setOpenedId] = React.useState<string | undefined>(undefined);
  const openFromList = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target: EventTarget = event.target;
    if (target instanceof HTMLElement && target.closest('button.events-list-item, button[aria-selected], button[data-entrant-id], button[data-source-id]')) {
      setOpenedId(`${props.selectedId || 'selection'}:${Date.now()}`);
    }
  };
  return <div className={props.className}>
    <AdminMasterDetailLayout detail={<div className="admin-detail-panes">{panes.slice(1)}</div>}
      detailLabel={props.detailLabel} list={<div onClick={openFromList}>{panes[0]}</div>} listLabel={props.listLabel}
      onBack={(): void => undefined} selectedId={`${props.selectedId || ''}:${openedId || ''}`} />
  </div>;
};

export const AdminFormSection = (props: { children: React.ReactNode; className?: string; title: string }): React.ReactElement =>
  <Stack className={props.className} component="section" spacing={2} sx={{ minWidth: 0, py: 1 }}>
    <Typography component="h2" variant="h6">{props.title}</Typography>{props.children}
  </Stack>;

export const AdminFieldGrid = (props: { children: React.ReactNode }): React.ReactElement =>
  <Box className="admin-field-grid" sx={{ '& .MuiFormControl-root': { minWidth: 0, width: '100%' },
    '& > h3, & > p, & > ul': { gridColumn: '1 / -1' },
    '& input, & textarea': { fontSize: { xs: 16 } }, display: 'grid', gap: 2,
    gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))', xs: 'minmax(0, 1fr)' } }}>
    {props.children}
  </Box>;

export const AdminActionBar = (props: {
  children: React.ReactNode;
  error?: string;
  pending?: boolean;
  success?: string;
}): React.ReactElement => <Stack className="admin-action-bar" spacing={1} aria-busy={props.pending || undefined}
  sx={{ '& button': { minHeight: 48, minWidth: 48 }, bgcolor: 'background.paper', bottom: 0,
    p: 1, pb: 'max(8px, env(safe-area-inset-bottom))', position: { sm: 'static', xs: 'sticky' }, zIndex: 2 }}>
  <Box sx={{ display: 'flex', flexDirection: { sm: 'row', xs: 'column' }, flexWrap: 'wrap', gap: 1 }}>{props.children}</Box>
  <Box aria-live="polite">{props.pending && <Typography>Saving…</Typography>}
    {props.error && <Alert severity="error">{props.error}</Alert>}
    {props.success && <Typography>{props.success}</Typography>}</Box>
</Stack>;

export type AdminSelectFieldProps = Omit<TextFieldProps, 'children' | 'onChange' | 'select' | 'value'> & {
  onValueChange: (value: string) => void;
  options: readonly AdminOption[];
  value: string;
};

export const AdminSelectField = (props: AdminSelectFieldProps): React.ReactElement => {
  const { onValueChange, options, value, ...fieldProps }: AdminSelectFieldProps = props;
  return <TextField {...fieldProps} fullWidth select value={value}
    onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onValueChange(event.target.value)}
    sx={{ '& .MuiSelect-select': { minHeight: '24px', py: 1.5 }, ...fieldProps.sx }}>
    {options.map((option: AdminOption): React.ReactElement =>
      <MenuItem disabled={option.disabled} key={option.value} value={option.value} sx={{ minHeight: 48 }}>{option.label}</MenuItem>)}
  </TextField>;
};

export const AdminAutocompleteField = (props: {
  error?: string;
  helperText?: string;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly AdminOption[];
  value: string;
}): React.ReactElement => <Autocomplete options={props.options}
  getOptionDisabled={(option: AdminOption): boolean => option.disabled === true}
  getOptionLabel={(option: AdminOption): string => option.label}
  isOptionEqualToValue={(first: AdminOption, second: AdminOption): boolean => first.value === second.value}
  onChange={(_event: React.SyntheticEvent, option: AdminOption | null): void => props.onValueChange(option?.value || '')}
  renderInput={(params: AutocompleteRenderInputParams): React.ReactElement => <TextField {...params}
    error={Boolean(props.error)} helperText={props.error || props.helperText} label={props.label}
    sx={{ '& .MuiInputBase-root': { minHeight: 48 } }} />}
  value={props.options.find((option: AdminOption): boolean => option.value === props.value) || null} />;

export const AdminChoiceGroup = (props: {
  label: string;
  onToggle: (value: string, checked: boolean) => void;
  options: readonly AdminOption[];
  values: readonly string[];
}): React.ReactElement => <Stack component="fieldset" sx={{ border: 0, m: 0, minWidth: 0, p: 0 }}>
  <Typography component="legend">{props.label}</Typography>
  {props.options.map((option: AdminOption): React.ReactElement => <FormControlLabel key={option.value}
    control={<Checkbox checked={props.values.includes(option.value)} disabled={option.disabled}
      onChange={(_event: React.ChangeEvent<HTMLInputElement>, checked: boolean): void => props.onToggle(option.value, checked)} />}
    label={option.label} sx={{ minHeight: 48 }} />)}
</Stack>;

export interface ResponsiveDataRow {
  cells: ReadonlyArray<{ label: string; value: React.ReactNode }>;
  id: string;
}

export const ResponsiveDataList = (props: { label: string; rows: readonly ResponsiveDataRow[] }): React.ReactElement =>
  <Stack aria-label={props.label} spacing={1} role="list">
    {props.rows.map((row: ResponsiveDataRow): React.ReactElement => <Box key={row.id} role="listitem"
      sx={{ borderBottom: 1, borderColor: 'divider', display: 'grid', gap: 1,
        gridTemplateColumns: { md: `repeat(${Math.max(row.cells.length, 1)}, minmax(0, 1fr))`, xs: 'minmax(0, 1fr)' }, py: 1 }}>
      {row.cells.map((cell: ResponsiveDataRow['cells'][number], index: number): React.ReactElement =>
        <Box key={`${cell.label}-${index}`} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography variant="caption" component="div">{cell.label}</Typography>{cell.value}
        </Box>)}
    </Box>)}
  </Stack>;

export const ResponsiveDialog = (props: DialogProps): React.ReactElement => {
  const phone: boolean = useMediaQuery(adminTheme.breakpoints.down('sm'));
  return <Dialog {...props} fullScreen={props.fullScreen ?? phone} />;
};
