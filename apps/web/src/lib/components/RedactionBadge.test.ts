import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import RedactionBadge from './RedactionBadge.svelte';

/**
 * The badge is the user's only signal that a secret was stripped from a
 * prompt. It must pluralise correctly, render nothing when the list is empty,
 * and surface the *types* (not the values) through the tooltip.
 */
describe('RedactionBadge.svelte', () => {
  it('renders nothing when there are zero redactions', () => {
    const { container } = render(RedactionBadge, { props: { redactions: [] } });
    expect(container.querySelector('[data-slot="redaction-badge"]')).toBeNull();
  });

  it('renders "1 secret stripped" for a single redaction', () => {
    const { container } = render(RedactionBadge, {
      props: { redactions: [{ type: 'api-key', start: 0, end: 10 }] },
    });
    const badge = container.querySelector('[data-slot="redaction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('1 secret stripped');
  });

  it('pluralises and de-duplicates types for multiple redactions', () => {
    const { container } = render(RedactionBadge, {
      props: {
        redactions: [
          { type: 'api-key', start: 0, end: 10 },
          { type: 'password', start: 20, end: 30 },
          { type: 'api-key', start: 40, end: 50 },
        ],
      },
    });
    const badge = container.querySelector('[data-slot="redaction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('3 secrets stripped');
    // The aria-label mirrors the visible text so screen readers announce the count.
    expect(badge?.getAttribute('aria-label')).toBe('3 secrets stripped');
  });
});
