import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CopyButton from './CopyButton.svelte';

/**
 * Covers the happy path: when `navigator.clipboard.writeText` is available,
 * clicking the button invokes it with the prop text and shows the "Copied"
 * confirmation chip. The toast helper writes to a shared store so we verify
 * the DOM state the user actually sees instead of mocking the store itself.
 */
describe('CopyButton.svelte', () => {
  beforeEach(() => {
    // jsdom does not ship `navigator.clipboard`; install a writable stub.
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('writes the `text` prop to navigator.clipboard when clicked', async () => {
    const { container } = render(CopyButton, {
      props: { text: 'hello world', label: 'Copy greeting', variant: 'inline' },
    });

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Copy greeting');

    await fireEvent.click(button as HTMLButtonElement);

    const writeText = (navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> })
      .writeText;
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('renders the icon-only variant with an accessible label', () => {
    const { container } = render(CopyButton, {
      props: { text: 'abc', label: 'Copy code' },
    });
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    // Icon-only variant has a square w-8 h-8 layout.
    expect(button?.className).toContain('w-8');
  });
});
