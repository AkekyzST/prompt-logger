<script lang="ts">
  /**
   * Type-to-confirm destructive dialog. Submit stays disabled until the user
   * types the exact confirmation phrase. Hosts any SvelteKit form via an
   * `action` string + hidden inputs so the pattern works without JS.
   */
  import type { Snippet } from 'svelte';
  import Dialog from '$lib/components/ui/dialog.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    heading: string;
    body: string;
    confirmPhrase: string;
    confirmLabel?: string;
    action: string;
    /** Hidden inputs rendered inside the form (e.g. row id). */
    hiddenFields?: Snippet;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    heading,
    body,
    confirmPhrase,
    confirmLabel = 'Delete',
    action,
    hiddenFields,
  }: Props = $props();

  let typed = $state('');
  const matches = $derived(typed.trim() === confirmPhrase);

  // Reset the input when the dialog toggles closed so a re-open starts clean.
  $effect(() => {
    if (!open) typed = '';
  });
</script>

<Dialog bind:open {onOpenChange}>
  {#snippet title()}{heading}{/snippet}
  {#snippet description()}{body}{/snippet}
  {#snippet children()}
    <form method="POST" {action} class="flex flex-col gap-4">
      {#if hiddenFields}{@render hiddenFields()}{/if}
      <div class="flex flex-col gap-1.5">
        <Label for="confirm-phrase">
          Type <span class="font-mono">{confirmPhrase}</span> to confirm
        </Label>
        <Input
          id="confirm-phrase"
          name="_confirm"
          autocomplete="off"
          spellcheck={false}
          bind:value={typed}
          aria-invalid={typed.length > 0 && !matches ? 'true' : undefined}
        />
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="destructive" disabled={!matches} aria-disabled={!matches}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  {/snippet}
</Dialog>
