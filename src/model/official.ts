import type { EventId, SessionId } from './raceevent.js';

export type OfficialAvailabilityStatus = 'available' | 'unavailable';

export interface OfficialAvailabilitySlot {
  endAt?: string;
  startAt?: string;
  status: OfficialAvailabilityStatus;
}

export interface OfficialProfileInput {
  availability: OfficialAvailabilitySlot[];
  displayName: string;
  email?: string;
  notes: string;
  phone?: string;
  position: string;
  responsibilities: string[];
}

export interface OfficialProfile extends OfficialProfileInput {
  archived: boolean;
  createdAt: string;
  id: string;
  updatedAt: string;
}

export interface OfficialAssignmentInput {
  eventId: EventId;
  notes: string;
  officialId: string;
  responsibilityOverride?: string;
  role: string;
  sessionId?: SessionId;
}

export interface OfficialAssignment extends OfficialAssignmentInput {
  createdAt: string;
  id: string;
  removed: boolean;
  updatedAt: string;
}

const isIsoInstant = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
  Number.isFinite(Date.parse(value));

export const normalizeOfficialProfile = (input: OfficialProfileInput): OfficialProfileInput => {
  const displayName: string = input.displayName.trim();
  const email: string | undefined = input.email?.trim() || undefined;
  const phone: string | undefined = input.phone?.trim() || undefined;
  const position: string = input.position.trim();
  const notes: string = input.notes.trim();
  const responsibilities: string[] = input.responsibilities.map((value: string): string => value.trim());
  if (!displayName || displayName.length > 150 || position.length > 150 || notes.length > 4_000) {
    throw new Error('Official name, position, or notes are invalid.');
  }
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))) {
    throw new Error('Official email address is invalid.');
  }
  if (phone && (!/^\+?[0-9][0-9 ()-]{4,31}$/u.test(phone) || phone.replace(/\D/gu, '').length < 5)) {
    throw new Error('Official phone number is invalid.');
  }
  if (responsibilities.length > 30 || responsibilities.some((value: string): boolean =>
    !value || value.length > 200) || new Set(responsibilities.map((value: string): string => value.toLocaleLowerCase())).size !== responsibilities.length) {
    throw new Error('Official responsibilities must be unique and nonempty.');
  }
  if (input.availability.length > 100 || input.availability.some((slot: OfficialAvailabilitySlot): boolean =>
    !['available', 'unavailable'].includes(slot.status) ||
    (slot.startAt !== undefined && !isIsoInstant(slot.startAt)) ||
    (slot.endAt !== undefined && !isIsoInstant(slot.endAt)) ||
    (slot.startAt !== undefined && slot.endAt !== undefined && Date.parse(slot.startAt) >= Date.parse(slot.endAt)))) {
    throw new Error('Official availability has an invalid time range.');
  }
  return {
    availability: input.availability.map((slot: OfficialAvailabilitySlot): OfficialAvailabilitySlot => ({ ...slot })),
    displayName,
    email,
    notes,
    phone,
    position,
    responsibilities,
  };
};

export const normalizeOfficialAssignment = (input: OfficialAssignmentInput): OfficialAssignmentInput => {
  const role: string = input.role.trim();
  const notes: string = input.notes.trim();
  const responsibilityOverride: string | undefined = input.responsibilityOverride?.trim() || undefined;
  if (!role || role.length > 100 || notes.length > 4_000 ||
    (responsibilityOverride !== undefined && responsibilityOverride.length > 200)) {
    throw new Error('Official assignment role or notes are invalid.');
  }
  return { ...input, notes, responsibilityOverride, role };
};
