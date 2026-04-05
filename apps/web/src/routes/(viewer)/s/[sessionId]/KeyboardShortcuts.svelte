<script lang="ts">
  import Dialog from '$lib/components/ui/dialog.svelte';

  type Props = { open: boolean; onOpenChange: (open: boolean) => void };
  let { open = $bindable(false), onOpenChange }: Props = $props();

  const rows: Array<{ keys: string[]; description: string }> = [
    { keys: ['j'], description: 'Focus next prompt' },
    { keys: ['k'], description: 'Focus previous prompt' },
    { keys: ['c'], description: 'Copy focused prompt' },
    { keys: ['g', 'g'], description: 'Jump to first prompt' },
    { keys: ['G'], description: 'Jump to last prompt' },
    { keys: ['?'], description: 'Show this dialog' },
    { keys: ['Esc'], description: 'Close dialog' },
  ];
</script>

<Dialog bind:open {onOpenChange}>
  {#snippet title()}Keyboard shortcuts{/snippet}
  {#snippet description()}Navigate, copy, and review prompts without leaving the keyboard.{/snippet}
  {#snippet children()}
    <ul class="flex flex-col gap-2 text-sm">
      {#each rows as row (row.description)}
        <li class="flex items-center justify-between gap-4">
          <span class="text-[color:var(--color-foreground)]">{row.description}</span>
          <span class="flex items-center gap-1">
            {#each row.keys as k, i (i)}
              <kbd
                class="inline-flex h-6 min-w-6 items-center justify-center rounded border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-1.5 font-mono text-[11px] tabular-nums text-[color:var(--color-muted-foreground)]"
                >{k}</kbd
              >
            {/each}
          </span>
        </li>
      {/each}
    </ul>
  {/snippet}
</Dialog>
