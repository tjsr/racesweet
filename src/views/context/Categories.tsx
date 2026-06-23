import { CategoriesPage } from '../../app/views/categories/categoriesPage.js';
import React from 'react';

type CategoriesContextProps = React.ComponentProps<typeof CategoriesPage>;

export const CategoriesContext = (props: CategoriesContextProps): React.ReactElement => {
  return <CategoriesPage {...props} />;
};
