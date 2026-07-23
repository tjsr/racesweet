import { EventCategory, EventCategoryId } from '../../model/eventcategory.js';

import Box from '@mui/material/Box';
import { GridRowId, type GridRowSelectionModel } from '@mui/x-data-grid';
import { DataGrid } from '@mui/x-data-grid/DataGrid';

interface CategoryListProps {
  categories: EventCategory[];
  categorySelected: (ids: Set<EventCategoryId>) => void;
  selectedCategories?: Set<EventCategoryId>;
}

export const CategoryList = (props: CategoryListProps) => {
  const { categories } = props;
  const rowSelectionModel: GridRowSelectionModel = {
    ids: new Set<GridRowId>(props.selectedCategories || []),
    type: 'include',
  };

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
        rowSelectionModel={rowSelectionModel}
        rowSelection={true}
        disableMultipleRowSelection={false}
        columns={[
          { field: 'id', headerName: 'ID', width: 90 },
          { field: 'name', flex: 1, headerName: 'Name' },
          { field: 'code', headerName: 'Code', width: 150 },
        ]}
      />
    </Box>
  );
};
