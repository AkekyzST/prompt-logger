<script lang="ts">
  /**
   * Single prompt card: seq, timestamp, optional redaction badge, monospace
   * body, and a copy button. Made focusable via tabindex=0 so j/k navigation
   * can land a visible focus ring on it.
   */
  import CopyButton from '$lib/components/CopyButton.svelte';
  import RedactionBadge from '$lib/components/RedactionBadge.svelte';
  import Time from '$lib/components/Time.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import type { Prompt } from '$lib/api/types.js';

  type Props = { prompt: Prompt; focused?: boolean };
  let { prompt, focused = false }: Props = $props();

  let el = $state<HTMLElement | null>(null);

  $effect(() => {
    if (focused && el && typeof document !== 'undefined' && document.activeElement !== el) {
      el.focus({ preventScroll: false });
    }
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex — prompt cards must be
     focusable for j/k keyboard navigation; they are programmatic focus
     targets, not interactive controls, so role="group" is correct. -->
<div
  bind:this={el}
  data-slot="prompt-card"
  data-prompt-id={prompt.id}
  data-seq={prompt.seq}
  tabindex="0"
  role="group"
  aria-label={`Prompt ${prompt.seq}`}
  class="group flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-[color:var(--color-card-foreground)] shadow-sm transition-[box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
>
  <header class="flex flex-wrap items-center gap-2 min-w-0">
    <span
      class="inline-flex items-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[color:var(--color-muted-foreground)]"
      aria-label={`Sequence ${prompt.seq}`}
    >
      #{prompt.seq}
    </span>
    {#if prompt.role === 'assistant'}
      <Badge variant="outline">assistant</Badge>
    {/if}
    <Time iso={prompt.createdAt} class="text-xs" />
    <RedactionBadge redactions={prompt.redactions} />
    <div class="ml-auto flex min-w-0 items-center">
      <CopyButton text={prompt.content} label={`Copy prompt ${prompt.seq}`} />
    </div>
  </header>
  <pre
    class="min-w-0 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-[color:var(--color-foreground)]"
  >{prompt.content}</pre>
</div>
