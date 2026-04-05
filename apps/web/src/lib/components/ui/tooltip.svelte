<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    label: string;
    children: Snippet;
    class?: string;
  };

  let { label, children, class: className }: Props = $props();
  let visible = $state(false);

  function show(): void {
    visible = true;
  }
  function hide(): void {
    visible = false;
  }
</script>

<span
  data-slot="tooltip"
  role="group"
  class="relative inline-block"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}
  {#if visible}
    <span
      data-slot="tooltip-content"
      role="tooltip"
      class={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-popover)] px-2 py-1 text-xs text-[color:var(--color-popover-foreground)] shadow-md',
        className
      )}
    >
      {label}
    </span>
  {/if}
</span>
