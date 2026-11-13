import React from 'react';
import { type ApplicationHelpSection, type HelpContent, type HelpControlKind, getConfiguredControlHelp } from '../../config/helpContent.js';

interface HelpTarget {
  content: HelpContent;
  element: HTMLElement;
}

interface OriginalHelpAttributes {
  ariaDescription: string | null;
  appliedAriaDescription?: string;
  appliedTitle?: string;
  title: string | null;
}

const interactiveSelector: string = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="tab"]',
].join(',');

const getAccessibleLabel = (element: HTMLElement): string => {
  const ariaLabel: string | null = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const label: HTMLLabelElement | null = element.labels?.item(0) || null;
    if (label?.textContent?.trim()) return label.textContent.trim();
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) {
      return element.placeholder;
    }
  }
  return element.textContent?.trim().replace(/\s+/gu, ' ') || '';
};

const getControlKind = (element: HTMLElement): HelpControlKind => {
  if (element.matches('[role="tab"]')) return 'tab';
  if (element.matches('a[href]')) return 'link';
  if (element.matches('textarea')) return 'textarea';
  if (element.matches('select, [role="combobox"]')) return 'select';
  if (element.matches('input[type="checkbox"], [role="checkbox"]')) return 'checkbox';
  if (element.matches('button, [role="button"]')) return 'button';
  return 'field';
};

const isVisible = (element: HTMLElement): boolean => {
  const style: CSSStyleDeclaration = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
};

const getHelpTargets = (root: HTMLElement): HelpTarget[] => Array.from(root.querySelectorAll<HTMLElement>(interactiveSelector))
  .filter((element: HTMLElement): boolean => isVisible(element))
  .map((element: HTMLElement): HelpTarget => {
    const label: string = getAccessibleLabel(element);
    const kind: HelpControlKind = getControlKind(element);
    return { content: getConfiguredControlHelp(label, kind), element };
  });

const getHelpTooltip = (content: HelpContent, originalTitle: string | null): string => [
  originalTitle,
  `${content.title}: ${content.description}`,
].filter((value: string | null): value is string => Boolean(value)).join('\n\n');

const applyHelpTooltips = (
  root: HTMLElement,
  originalAttributes: Map<HTMLElement, OriginalHelpAttributes>,
): void => {
  getHelpTargets(root).forEach((target: HelpTarget): void => {
    const original: OriginalHelpAttributes = originalAttributes.get(target.element) || {
      ariaDescription: target.element.getAttribute('aria-description'),
      title: target.element.getAttribute('title'),
    };
    if (target.element.getAttribute('title') !== original.appliedTitle) {
      original.title = target.element.getAttribute('title');
    }
    if (target.element.getAttribute('aria-description') !== original.appliedAriaDescription) {
      original.ariaDescription = target.element.getAttribute('aria-description');
    }
    originalAttributes.set(target.element, original);
    const tooltip: string = getHelpTooltip(target.content, original.title);
    if (target.element.getAttribute('title') !== tooltip) target.element.setAttribute('title', tooltip);
    original.appliedTitle = tooltip;
    if (target.element.getAttribute('aria-description') !== target.content.description) {
      target.element.setAttribute('aria-description', target.content.description);
    }
    original.appliedAriaDescription = target.content.description;
  });
};

const restoreHelpTooltips = (originalAttributes: Map<HTMLElement, OriginalHelpAttributes>): void => {
  originalAttributes.forEach((original: OriginalHelpAttributes, element: HTMLElement): void => {
    if (original.title === null) element.removeAttribute('title');
    else element.setAttribute('title', original.title);
    if (original.ariaDescription === null) element.removeAttribute('aria-description');
    else element.setAttribute('aria-description', original.ariaDescription);
  });
};

export interface ContextualHelpOverlayProps {
  children: React.ReactNode;
  section: ApplicationHelpSection;
}

/**
 * Adds the relevant help directly to the browser tooltip and accessible
 * description of each visible interactive control.
 */
export const ContextualHelpOverlay = (props: ContextualHelpOverlayProps): React.ReactElement => {
  const rootRef: React.RefObject<HTMLDivElement | null> = React.useRef<HTMLDivElement | null>(null);

  React.useEffect((): (() => void) | undefined => {
    const root: HTMLDivElement | null = rootRef.current;
    if (!root) return undefined;
    const originalAttributes: Map<HTMLElement, OriginalHelpAttributes> = new Map();
    const refresh = (): void => applyHelpTooltips(root, originalAttributes);
    const observer: MutationObserver = new MutationObserver(refresh);
    observer.observe(root, { attributes: true, childList: true, subtree: true });
    refresh();
    return (): void => {
      observer.disconnect();
      restoreHelpTooltips(originalAttributes);
    };
  }, [props.section]);

  return <div ref={rootRef} className="contextual-help-root">{props.children}</div>;
};
