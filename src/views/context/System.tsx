import React from 'react';
import { SystemPage } from '../../app/views/system/systemPage.js';

type SystemContextProps = React.ComponentProps<typeof SystemPage>;

export const SystemContext = (props: SystemContextProps): React.ReactElement => {
  return <SystemPage {...props} />;
};
