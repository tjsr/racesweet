import { EventCategory, EventCategoryId } from '../../model/eventcategory.js';
import { GridEventListener, GridRowId } from '@mui/x-data-grid';

import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid/DataGrid';

interface CategoryListProps {
  categories: EventCategory[];
  categorySelected: (ids: Set<EventCategoryId>) => void;
}

export const CategoryList = (props: CategoryListProps) => {
  const { categories } = props;

  if (!categories || categories.length === 0) {
    return <p>No categories available.</p>;
  }

  return (
    <Box sx={{ flexGrow: 1, width: '100%' }}>
      <h2>Categories</h2>
      <DataGrid
        rows={categories}
        onRowClick={() => undefined}
        onRowSelectionModelChange={(newSelection) => {
          if (props.categorySelected && newSelection.ids) {
            props.categorySelected(new Set(newSelection.ids.values().map((id: GridRowId) => id.toString())));
          }
        }}
        rowSelection={true}
        disableMultipleRowSelection={false}
        columns={[
          { field: 'id', headerName: 'ID', width: 90 },
          { field: 'name', headerName: 'Name', flex: 1 },
          { field: 'code', headerName: 'Code', width: 150 },
        ]}
      />
    </Box>
  );
};
