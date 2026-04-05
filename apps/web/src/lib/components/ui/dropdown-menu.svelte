<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    trigger: Snippet;
    children: Snippet;
    align?: 'start' | 'end';
    class?: string;
  };

  let { trigger, children, align = 'end', class: className }: Props = $props();

  let open = $state(false);
  let rootEl = $state<HTMLDivElement | null>(null);

  function toggle(): void {
    open = !open;
  }

  function handleDocumentClick(event: MouseEvent): void {
    if (!open) return;
    if (rootEl && !rootEl.contains(event.target as Node)) open = false;
  }

  function handleDocumentKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={handleDocumentClick} onkeydown={handleDocumentKey} />

<div data-slot="dropdown-menu" class="relative inline-block" bind:this={rootEl}>
  <button
    data-slot="dropdown-menu-trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
    class="inline-flex items-center"
  >
    {@render trigger()}
  </button>
  {#if open}
    <div
      data-slot="dropdown-menu-content"
      role="menu"
      class={cn(
        'absolute z-50 mt-2 min-w-[10rem] rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-popover)] p-1 text-sm text-[color:var(--color-popover-foreground)] shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
    >
      {@render children()}
    </div>
  {/if}
</div>
