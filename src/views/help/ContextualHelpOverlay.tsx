import { Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import React from 'react';
import { type ApplicationHelpSection, type HelpContent, type HelpControlKind, applicationHelpSections, getConfiguredControlHelp } from '../../config/helpContent.js';

interface HelpTarget {
  content: HelpContent;
  element: HTMLElement;
  id: string;
  kind: HelpControlKind;
}

interface HelpTargetPosition extends HelpTarget {
  left: number;
  top: number;
}

const helpButtonSize: number = 26;
const helpControlGap: number = 4;
const viewportEdgeGap: number = 4;

const interactiveSelector: string = [
  'a[href]',
  'button:not([data-contextual-help-control])',
  'input:not([type="hidden"]):not([data-contextual-help-control])',
  'select:not([data-contextual-help-control])',
  'textarea:not([data-contextual-help-control])',
  '[role="button"]:not([data-contextual-help-control])',
  '[role="checkbox"]:not([data-contextual-help-control])',
  '[role="combobox"]:not([data-contextual-help-control])',
  '[role="tab"]:not([data-contextual-help-control])',
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
  const rect: DOMRect = element.getBoundingClientRect();
  return style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0 &&
    rect.top < window.innerHeight;
};

const getHelpTargets = (root: HTMLElement): HelpTarget[] => Array.from(root.querySelectorAll<HTMLElement>(interactiveSelector))
  .filter((element: HTMLElement): boolean => isVisible(element))
  .map((element: HTMLElement, index: number): HelpTarget => {
    const label: string = getAccessibleLabel(element);
    const kind: HelpControlKind = getControlKind(element);
    return {
      content: getConfiguredControlHelp(label, kind),
      element,
      id: `${kind}-${label || 'control'}-${index}`,
      kind,
    };
  });

const getHelpTargetPositions = (root: HTMLElement): HelpTargetPosition[] => {
  return getHelpTargets(root).map((target: HelpTarget): HelpTargetPosition => {
    const targetRect: DOMRect = target.element.getBoundingClientRect();
    const canPlaceAfter: boolean = targetRect.right + helpControlGap + helpButtonSize <= window.innerWidth - viewportEdgeGap;
    const left: number = canPlaceAfter
      ? targetRect.right + helpControlGap
      : Math.max(viewportEdgeGap, targetRect.left - helpControlGap - helpButtonSize);
    const top: number = Math.min(
      Math.max(viewportEdgeGap, targetRect.top + (targetRect.height - helpButtonSize) / 2),
      Math.max(viewportEdgeGap, window.innerHeight - helpButtonSize - viewportEdgeGap),
    );
    return {
      ...target,
      left,
      top,
    };
  });
};

export interface ContextualHelpOverlayProps {
  children: React.ReactNode;
  section: ApplicationHelpSection;
}

/**
 * Adds a small help affordance beside each visible, interactive control without
 * requiring copy to be coupled to the page that owns that control.
 */
export const ContextualHelpOverlay = (props: ContextualHelpOverlayProps): React.ReactElement => {
  const rootRef: React.RefObject<HTMLDivElement | null> = React.useRef<HTMLDivElement | null>(null);
  const [targets, setTargets] = React.useState<HelpTargetPosition[]>([]);
  const [selectedHelp, setSelectedHelp] = React.useState<HelpContent | undefined>(undefined);

  React.useEffect((): (() => void) | undefined => {
    const root: HTMLDivElement | null = rootRef.current;
    if (!root) return undefined;
    let frame: number | undefined;
    const refresh = (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame((): void => setTargets(getHelpTargetPositions(root)));
    };
    const observer: MutationObserver = new MutationObserver(refresh);
    const resizeObserver: ResizeObserver = new ResizeObserver(refresh);
    observer.observe(root, { attributes: true, childList: true, subtree: true });
    resizeObserver.observe(root);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    refresh();
    return (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [props.section]);

  const pageHelp: HelpContent = applicationHelpSections[props.section];
  return <div ref={rootRef} className="contextual-help-root">
    {props.children}
    <Tooltip title={`Help: ${pageHelp.title}`}>
      <IconButton aria-label={`Help for ${pageHelp.title}`} className="contextual-page-help"
        data-contextual-help-control onClick={(): void => setSelectedHelp(pageHelp)} size="small">
        <span aria-hidden="true">?</span>
      </IconButton>
    </Tooltip>
    {targets.map((target: HelpTargetPosition): React.ReactElement => <Tooltip key={target.id} title={`Help: ${target.content.title}`}>
      <IconButton aria-label={`Help for ${target.content.title}`} className="contextual-control-help"
        data-contextual-help-control onClick={(): void => setSelectedHelp(target.content)} size="small"
        style={{ left: `${target.left}px`, top: `${target.top}px` }}>
        <span aria-hidden="true">?</span>
      </IconButton>
    </Tooltip>)}
    <Dialog aria-labelledby="contextual-help-title" onClose={(): void => setSelectedHelp(undefined)} open={Boolean(selectedHelp)}>
      <DialogTitle id="contextual-help-title">{selectedHelp?.title}</DialogTitle>
      <DialogContent><Typography>{selectedHelp?.description}</Typography></DialogContent>
      <DialogActions><IconButton aria-label="Close help" data-contextual-help-control
        onClick={(): void => setSelectedHelp(undefined)}>×</IconButton></DialogActions>
    </Dialog>
  </div>;
};
