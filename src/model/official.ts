import type { EventId, SessionId } from './raceevent.js';

export type OfficialAvailabilityStatus = 'available' | 'unavailable';

export interface OfficialAvailabilitySlot {
  endAt?: string;
  startAt?: string;
  status: OfficialAvailabilityStatus;
}

export interface IndividualLicense {
  expiresOn?: string;
  issuer?: string;
  number: string;
  type?: string;
}

export interface IndividualEmergencyContact {
  email?: string;
  name: string;
  phone: string;
  relationship?: string;
}

export interface OfficialProfileInput {
  dateOfBirth?: string;
  displayName: string;
  email?: string;
  emergencyContacts?: IndividualEmergencyContact[];
  firstName?: string;
  gender?: string;
  lastName?: string;
  licenses?: IndividualLicense[];
  notes: string;
  phone?: string;
}

export interface OfficialProfile extends OfficialProfileInput {
  /** @deprecated Availability is now scoped to each official assignment. */
  availability?: OfficialAvailabilitySlot[];
  archived: boolean;
  createdAt: string;
  id: string;
  /** @deprecated Position is now scoped to each official assignment. */
  position?: string;
  /** @deprecated Responsibilities are now scoped to each official assignment. */
  responsibilities?: string[];
  updatedAt: string;
}

export interface OfficialAssignmentInput {
  availability: OfficialAvailabilitySlot[];
  eventId: EventId;
  notes: string;
  officialId: string;
  position: string;
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

const isEmail = (value: string): boolean => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
const isPhone = (value: string): boolean => /^\+?[0-9][0-9 ()-]{4,31}$/u.test(value) &&
  value.replace(/\D/gu, '').length >= 5;

export const splitIndividualName = (displayName: string): { firstName: string; lastName: string } => {
  const name: string = displayName.trim();
  const separator: number = name.indexOf(' ');
  return separator < 0 ? { firstName: name, lastName: '' } : {
    firstName: name.slice(0, separator), lastName: name.slice(separator + 1).trim(),
  };
};

export const normalizeOfficialProfile = (input: OfficialProfileInput): OfficialProfileInput => {
  const firstName: string | undefined = input.firstName?.trim();
  const lastName: string | undefined = input.lastName?.trim();
  const displayName: string = firstName !== undefined || lastName !== undefined
    ? [firstName, lastName].filter(Boolean).join(' ').trim() : input.displayName.trim();
  const dateOfBirth: string | undefined = input.dateOfBirth?.trim() || undefined;
  const gender: string | undefined = input.gender?.trim() || undefined;
  const email: string | undefined = input.email?.trim() || undefined;
  const phone: string | undefined = input.phone?.trim() || undefined;
  const notes: string = input.notes.trim();
  const licenses: IndividualLicense[] = (input.licenses || []).map((license: IndividualLicense): IndividualLicense => ({
    expiresOn: license.expiresOn?.trim() || undefined,
    issuer: license.issuer?.trim() || undefined,
    number: license.number.trim(),
    type: license.type?.trim() || undefined,
  }));
  const emergencyContacts: IndividualEmergencyContact[] = (input.emergencyContacts || []).map(
    (contact: IndividualEmergencyContact): IndividualEmergencyContact => ({
      email: contact.email?.trim() || undefined,
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      relationship: contact.relationship?.trim() || undefined,
    }),
  );
  if (!displayName || displayName.length > 150 || (firstName !== undefined && !firstName) ||
    (firstName?.length || 0) > 100 || (lastName?.length || 0) > 100 ||
    notes.length > 4_000) {
    throw new Error('Individual name or notes are invalid.');
  }
  if (gender && gender.length > 100) {
    throw new Error('Individual gender is invalid.');
  }
  if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/u.test(dateOfBirth) ||
    Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00.000Z`)) ||
    new Date(`${dateOfBirth}T00:00:00.000Z`).toISOString().slice(0, 10) !== dateOfBirth)) {
    throw new Error('Individual date of birth is invalid.');
  }
  if (email && !isEmail(email)) {
    throw new Error('Official email address is invalid.');
  }
  if (phone && !isPhone(phone)) {
    throw new Error('Official phone number is invalid.');
  }
  if (licenses.length > 20 || licenses.some((license: IndividualLicense): boolean =>
    !license.number || license.number.length > 100 || (license.issuer?.length || 0) > 150 ||
    (license.type?.length || 0) > 100 ||
    (license.expiresOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(license.expiresOn)))) {
    throw new Error('Individual license details are invalid.');
  }
  if (emergencyContacts.length > 10 || emergencyContacts.some((contact: IndividualEmergencyContact): boolean =>
    !contact.name || contact.name.length > 150 || !isPhone(contact.phone) ||
    (contact.email !== undefined && !isEmail(contact.email)) || (contact.relationship?.length || 0) > 100)) {
    throw new Error('Individual emergency contact details are invalid.');
  }
  return {
    dateOfBirth,
    displayName,
    email,
    emergencyContacts,
    firstName,
    gender,
    lastName,
    licenses,
    notes,
    phone,
  };
};

export const normalizeOfficialAssignment = (input: OfficialAssignmentInput): OfficialAssignmentInput => {
  const availability: OfficialAvailabilitySlot[] = input.availability.map((slot: OfficialAvailabilitySlot): OfficialAvailabilitySlot => ({ ...slot }));
  const position: string = input.position.trim();
  const role: string = input.role.trim();
  const notes: string = input.notes.trim();
  const responsibilityOverride: string | undefined = input.responsibilityOverride?.trim() || undefined;
  if (!position || position.length > 150 || !role || role.length > 100 || notes.length > 4_000 ||
    (responsibilityOverride !== undefined && responsibilityOverride.length > 200)) {
    throw new Error('Official assignment position, role, or notes are invalid.');
  }
  if (availability.length > 100 || availability.some((slot: OfficialAvailabilitySlot): boolean =>
    !['available', 'unavailable'].includes(slot.status) ||
    (slot.startAt !== undefined && !isIsoInstant(slot.startAt)) ||
    (slot.endAt !== undefined && !isIsoInstant(slot.endAt)) ||
    (slot.startAt !== undefined && slot.endAt !== undefined && Date.parse(slot.startAt) >= Date.parse(slot.endAt)))) {
    throw new Error('Official assignment availability has an invalid time range.');
  }
  return { ...input, availability, notes, position, responsibilityOverride, role };
};
