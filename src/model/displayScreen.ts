import type { EventId, SessionId } from './raceevent.js';

export type DisplayComponentType =
  | 'clock'
  | 'event-title'
  | 'leaderboard'
  | 'results-table'
  | 'sponsor-image'
  | 'text-panel';

interface DisplayComponentBase {
  height: number;
  id: string;
  layered?: boolean;
  width: number;
  x: number;
  y: number;
  zIndex: number;
}

export type DisplayComponent =
  | (DisplayComponentBase & { settings: { showSession: boolean }; type: 'event-title' })
  | (DisplayComponentBase & { settings: { format: 'date-time' | 'time'; timeZone: 'event' | 'local' }; type: 'clock' })
  | (DisplayComponentBase & { settings: { limit: number; scope: 'overall' | 'category'; categoryId?: string }; type: 'leaderboard' | 'results-table' })
  | (DisplayComponentBase & { settings: { alt: string; mediaDataUrl: string }; type: 'sponsor-image' })
  | (DisplayComponentBase & { settings: { text: string }; type: 'text-panel' });

export interface DisplayScreenRevision {
  items: DisplayComponent[];
  revision: number;
  savedAt: string;
}

export interface DisplayScreenTemplate {
  archived: boolean;
  createdAt: string;
  draft: DisplayScreenRevision;
  id: string;
  name: string;
  publishedRevision?: number;
  publishedRevisions: DisplayScreenRevision[];
  updatedAt: string;
}

export interface DisplayShareLink {
  active: boolean;
  createdAt: string;
  eventId: EventId;
  expiresAt?: string;
  id: string;
  revision: number;
  sessionId?: SessionId;
  templateId: string;
  tokenHash: string;
}

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

export const validateDisplayLayout = (items: DisplayComponent[], allowEmpty: boolean = true): void => {
  if (!Array.isArray(items) || (!allowEmpty && items.length === 0) || items.length > 100) {
    throw new Error('Display layout must contain 1 to 100 components.');
  }
  const identifiers: Set<string> = new Set<string>();
  items.forEach((item: DisplayComponent): void => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
      !item.id.trim() || identifiers.has(item.id)) {
      throw new Error('Display component IDs must be unique and nonempty.');
    }
    identifiers.add(item.id);
    if (!Number.isSafeInteger(item.x) || item.x < 0 || !Number.isSafeInteger(item.y) || item.y < 0 ||
      !isPositiveInteger(item.width) || !isPositiveInteger(item.height) ||
      (item.layered !== undefined && typeof item.layered !== 'boolean') ||
      item.x + item.width > 12 || !Number.isSafeInteger(item.zIndex)) {
      throw new Error('Display component lies outside the 12-column grid.');
    }
    if (!item.settings || typeof item.settings !== 'object') {
      throw new Error(`Invalid settings for display component ${item.id}.`);
    }
    if (item.type === 'event-title' && typeof item.settings.showSession === 'boolean') return;
    if (item.type === 'clock' && ['time', 'date-time'].includes(item.settings.format) &&
      ['event', 'local'].includes(item.settings.timeZone)) return;
    if ((item.type === 'leaderboard' || item.type === 'results-table') &&
      isPositiveInteger(item.settings.limit) && item.settings.limit <= 100 &&
      ['overall', 'category'].includes(item.settings.scope) &&
      (item.settings.scope === 'overall' ||
        (typeof item.settings.categoryId === 'string' && !!item.settings.categoryId.trim()))) return;
    if (item.type === 'sponsor-image' && typeof item.settings.alt === 'string' &&
      typeof item.settings.mediaDataUrl === 'string' && item.settings.alt.length <= 200 &&
      item.settings.mediaDataUrl.length <= 250_000 &&
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(item.settings.mediaDataUrl)) return;
    if (item.type === 'text-panel' && typeof item.settings.text === 'string' &&
      item.settings.text.length <= 2_000 && !/<\/?[A-Za-z][^>]*>/u.test(item.settings.text)) return;
    throw new Error(`Invalid settings for display component ${item.id}.`);
  });
  items.forEach((item: DisplayComponent, index: number): void => {
    if (item.layered) return;
    items.slice(index + 1).forEach((other: DisplayComponent): void => {
      if (!other.layered && item.x < other.x + other.width && other.x < item.x + item.width &&
        item.y < other.y + other.height && other.y < item.y + item.height) {
        throw new Error(`Display components ${item.id} and ${other.id} overlap.`);
      }
    });
  });
};

export const generateDisplayToken = (): string => {
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(32));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
};

export const hashDisplayToken = async (token: string): Promise<string> => {
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new TextEncoder().encode(token).buffer as ArrayBuffer);
  const hash: ArrayBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
};
