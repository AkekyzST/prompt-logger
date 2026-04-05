import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { formatAbsolute } from '../format/time.js';
import Time from './Time.svelte';

describe('Time.svelte', () => {
  it('renders the absolute UTC string on first render', () => {
    const iso = '2026-04-05T12:34:56.000Z';
    const { container } = render(Time, { props: { iso } });
    const el = container.querySelector('time');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('datetime')).toBe(iso);
    // Initial render (pre-hydration tick) shows the absolute UTC form.
    expect(el?.textContent?.trim()).toContain(formatAbsolute(iso));
  });
});
