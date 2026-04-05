import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';

describe('ConfirmDeleteDialog.svelte', () => {
  it('keeps the destructive submit disabled until the confirm phrase matches', async () => {
    const { container, getByLabelText } = render(ConfirmDeleteDialog, {
      props: {
        open: true,
        onOpenChange: () => {},
        heading: 'Delete this session?',
        body: 'Type the session title to confirm.',
        confirmPhrase: 'my-session',
        action: '?/delete',
      },
    });

    // Locate the destructive submit button by its visible label.
    const submit = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete'
    ) as HTMLButtonElement | undefined;
    expect(submit).toBeDefined();
    expect(submit?.disabled).toBe(true);

    // Typing the wrong phrase keeps it disabled.
    const input = getByLabelText(/Type/i) as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'wrong' } });
    expect(submit?.disabled).toBe(true);

    // Typing the exact phrase enables the submit.
    await fireEvent.input(input, { target: { value: 'my-session' } });
    expect(submit?.disabled).toBe(false);
  });
});
