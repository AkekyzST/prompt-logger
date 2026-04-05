import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import VisibilityBadge from './VisibilityBadge.svelte';

describe('VisibilityBadge.svelte', () => {
  it('renders the private variant with a Lock icon and a "Private" label', () => {
    const { container } = render(VisibilityBadge, { props: { visibility: 'private' } });
    const badge = container.querySelector('[data-slot="visibility-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-visibility')).toBe('private');
    expect(badge?.textContent).toContain('Private');
    // Lucide renders the icon as an SVG; any SVG child proves icon rendering.
    expect(badge?.querySelector('svg')).not.toBeNull();
  });

  it('renders the shared variant with a "Shared" label', () => {
    const { container } = render(VisibilityBadge, { props: { visibility: 'shared' } });
    const badge = container.querySelector('[data-slot="visibility-badge"]');
    expect(badge?.getAttribute('data-visibility')).toBe('shared');
    expect(badge?.textContent).toContain('Shared');
  });

  it('renders the code variant with a "Class code" label', () => {
    const { container } = render(VisibilityBadge, { props: { visibility: 'code' } });
    const badge = container.querySelector('[data-slot="visibility-badge"]');
    expect(badge?.getAttribute('data-visibility')).toBe('code');
    expect(badge?.textContent).toContain('Class code');
  });
});
