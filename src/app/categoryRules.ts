import type {
  CategoryDistanceRule,
  CategorySessionAssignment,
  CategoryTeamCompositionRule,
} from './eventCatalog.js';

const timePattern = /^\d+(:[0-5]\d)?$/;

export const parseCategoryDistanceRule = (raw: string): CategoryDistanceRule => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: 'unspecified' };
  }

  if (timePattern.test(trimmed) && (trimmed.includes(':') || Number(trimmed) > 24)) {
    return {
      kind: 'time',
      value: trimmed,
    };
  }

  const laps = Number(trimmed);
  if (!Number.isFinite(laps) || laps <= 0 || !Number.isInteger(laps)) {
    throw new Error('Distance must be blank, a time value (minutes or h:mm), or a whole number of laps.');
  }

  return {
    kind: 'laps',
    value: laps,
  };
};

export const formatCategoryDistanceRule = (rule: CategoryDistanceRule | undefined): string => {
  if (!rule || rule.kind === 'unspecified') {
    return '';
  }

  if (rule.kind === 'time') {
    return rule.value;
  }

  return rule.value.toString();
};

export const parseTeamCompositionRules = (raw: string): CategoryTeamCompositionRule[] => {
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const [genderSegment, minSegment, maxSegment] = item.split(':').map((part) => part.trim());
      if (!genderSegment) {
        throw new Error('Gender rule entries must include a gender name.');
      }

      const min = minSegment ? Number(minSegment) : undefined;
      const max = maxSegment ? Number(maxSegment) : undefined;

      if ((minSegment && (!Number.isInteger(min) || min! < 0)) || (maxSegment && (!Number.isInteger(max) || max! < 0))) {
        throw new Error('Gender rule min/max values must be whole numbers.');
      }

      return {
        gender: genderSegment,
        max,
        min,
      };
    });
};

export const formatTeamCompositionRules = (rules: CategoryTeamCompositionRule[] | undefined): string => {
  if (!rules || rules.length === 0) {
    return '';
  }

  return rules
    .map((rule) => `${rule.gender}:${rule.min ?? ''}:${rule.max ?? ''}`)
    .join('; ');
};

export const parseCategorySessionAssignments = (raw: string): CategorySessionAssignment[] => {
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const [sessionId, startTime] = item.split('@').map((part) => part.trim());
      if (!sessionId || !startTime) {
        throw new Error('Session assignment entries must use sessionId@startTime format.');
      }

      return {
        sessionId,
        startTime,
      };
    });
};

export const formatCategorySessionAssignments = (assignments: CategorySessionAssignment[] | undefined): string => {
  if (!assignments || assignments.length === 0) {
    return '';
  }

  return assignments
    .map((assignment) => `${assignment.sessionId}@${assignment.startTime}`)
    .join('; ');
};
