import React from 'react';
import { Box, Button, Drawer, type Theme, Typography, useMediaQuery, useTheme } from '@mui/material';

export interface AdminNavigationItem<TId extends string> {
  disabled?: boolean;
  icon: string;
  id: TId;
  label: string;
}

export const ResponsiveSectionNavigation = <TId extends string,>(props: {
  items: readonly AdminNavigationItem<TId>[];
  onSelect: (id: TId) => void;
  selectedId: TId;
}): React.ReactElement => {
  const theme: Theme = useTheme();
  const phone: boolean = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = React.useState<boolean>(false);
  const select = (id: TId): void => {
    props.onSelect(id);
    setOpen(false);
  };
  const navigation: React.ReactElement = <Box component="nav" className="section-nav" aria-label="Application sections">
    {props.items.map((item: AdminNavigationItem<TId>): React.ReactElement => <Button key={item.id}
      aria-current={item.id === props.selectedId ? 'page' : undefined} aria-label={item.label}
      className={`section-tile${item.id === props.selectedId ? ' active' : ''}`} disabled={item.disabled}
      onClick={(): void => select(item.id)} sx={{ color: 'inherit', flexShrink: 0, minHeight: 48, minWidth: 48, textTransform: 'none' }}>
      <span className="section-icon" aria-hidden="true">{item.icon}</span>
      <span className="section-label">{item.label}</span>
    </Button>)}
  </Box>;
  if (!phone) return navigation;
  return <>
    <Box className="admin-section-menu" sx={{ alignItems: 'center', bgcolor: 'background.paper', display: 'flex',
      height: 56, left: 0, position: 'fixed', right: 0, top: 0, zIndex: 'appBar' }}>
      <Button aria-label="Open section navigation" aria-expanded={open} onClick={(): void => setOpen(true)} sx={{ minHeight: 48, minWidth: 48 }}>
        Menu
      </Button>
      <Typography>{props.items.find((item: AdminNavigationItem<TId>): boolean => item.id === props.selectedId)?.label}</Typography>
    </Box>
    <Drawer open={open} onClose={(): void => setOpen(false)} slotProps={{ paper: { sx: { maxWidth: '90vw' } } }}>
      <Button onClick={(): void => setOpen(false)} sx={{ minHeight: 48 }}>Close navigation</Button>
      {navigation}
    </Drawer>
  </>;
};
