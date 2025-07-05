import Box from "@mui/material/Box";
import { DataGrid } from "@mui/x-data-grid/DataGrid";
import { EventCategory } from "../../model/eventcategory.ts";

interface CategoryListProps {
  categories: EventCategory[];
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
        columns={[
          { field: 'id', headerName: 'ID', width: 90 },
          { field: 'name', headerName: 'Name', flex: 1 },
          { field: 'code', headerName: 'Code', width: 150 },
        ]}
      />
    </Box>
  );
};
