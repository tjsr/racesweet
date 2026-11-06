export type HelpControlKind =
  | 'button'
  | 'checkbox'
  | 'field'
  | 'link'
  | 'select'
  | 'tab'
  | 'textarea';

export interface HelpContent {
  description: string;
  title: string;
}

interface HelpMatcher extends HelpContent {
  exact?: string;
  startsWith?: string;
}

export type ApplicationHelpSection =
  | 'System'
  | 'Events'
  | 'Participants'
  | 'Categories'
  | 'Sessions'
  | 'Timing'
  | 'Results'
  | 'Reports';

/**
 * Central copy for the in-product help affordances. Keep help wording here,
 * rather than beside individual page controls, so it can be reviewed and
 * maintained independently of the UI implementation.
 */
export const applicationHelpSections: Readonly<Record<ApplicationHelpSection, HelpContent>> = {
  Categories: {
    description: 'Create and maintain the classes used to group entrants and configure their rules and starts.',
    title: 'Categories',
  },
  Events: {
    description: 'Create and configure race events, including dates, track data, timing settings, and data sources.',
    title: 'Events',
  },
  Participants: {
    description: 'Manage entrants, individual profiles, and officials for the selected event.',
    title: 'Participants',
  },
  Reports: {
    description: 'Choose a race view or report, then filter it by the selected event, session, and category.',
    title: 'Reports',
  },
  Results: {
    description: 'Review calculated race results and switch the event, session, category, or result view when required.',
    title: 'Results',
  },
  Sessions: {
    description: 'Create and configure the sessions that belong to an event, including their timing and category assignments.',
    title: 'Sessions',
  },
  System: {
    description: 'Configure RaceSweet-wide settings, timing data sources, server connections, and storage locations.',
    title: 'System',
  },
  Timing: {
    description: 'Select the event and session being timed, then review incoming crossings or record manual timing data.',
    title: 'Timing',
  },
};

const controlKindHelp: Readonly<Record<HelpControlKind, HelpContent>> = {
  button: {
    description: 'Select this action to continue. Its result is shown in the surrounding page when the action completes.',
    title: 'Action',
  },
  checkbox: {
    description: 'Turn this option on or off. The current tick state shows whether it is enabled.',
    title: 'Option',
  },
  field: {
    description: 'Enter or edit the value for this field. Save the surrounding form when you have finished making changes.',
    title: 'Field',
  },
  link: {
    description: 'Open the related view or resource.',
    title: 'Link',
  },
  select: {
    description: 'Choose the value that should apply in the current event and page context.',
    title: 'Selection',
  },
  tab: {
    description: 'Open this area to work with the related information without leaving the current page.',
    title: 'Workspace',
  },
  textarea: {
    description: 'Enter longer free-form information here. Save the surrounding form when you have finished making changes.',
    title: 'Notes field',
  },
};

const controlMatchers: readonly HelpMatcher[] = [
  {
    description: 'Creates a new item in the current event or system configuration. Complete the resulting form and save it to persist the item.',
    startsWith: 'Add',
    title: 'Add item',
  },
  {
    description: 'Creates a new item in the current event or system configuration. Complete the resulting form and save it to persist the item.',
    startsWith: 'Create',
    title: 'Create item',
  },
  {
    description: 'Saves the current changes. RaceSweet validates the values and reports any issue before the change is persisted.',
    exact: 'Save',
    title: 'Save changes',
  },
  {
    description: 'Removes the selected item. Check the confirmation and any dependent race data before continuing.',
    startsWith: 'Delete',
    title: 'Delete item',
  },
  {
    description: 'Removes the selected item or assignment. Check the confirmation and any dependent race data before continuing.',
    startsWith: 'Remove',
    title: 'Remove item',
  },
  {
    description: 'Imports data into the current event. Confirm the selected file and review any validation messages after the import.',
    startsWith: 'Import',
    title: 'Import data',
  },
  {
    description: 'Loads or refreshes data from the configured source. Existing display data may update when the operation completes.',
    startsWith: 'Load',
    title: 'Load data',
  },
  {
    description: 'Loads or refreshes data from the configured source. Existing display data may update when the operation completes.',
    startsWith: 'Reload',
    title: 'Reload data',
  },
];

export const getConfiguredControlHelp = (
  label: string,
  kind: HelpControlKind,
): HelpContent => {
  const normalizedLabel: string = label.trim();
  const matchedHelp: HelpMatcher | undefined = controlMatchers.find((matcher: HelpMatcher): boolean =>
    (matcher.exact !== undefined && matcher.exact === normalizedLabel) ||
    (matcher.startsWith !== undefined && normalizedLabel.startsWith(matcher.startsWith)));
  const content: HelpContent = matchedHelp || controlKindHelp[kind];
  return {
    description: content.description,
    title: normalizedLabel ? `${content.title}: ${normalizedLabel}` : content.title,
  };
};
