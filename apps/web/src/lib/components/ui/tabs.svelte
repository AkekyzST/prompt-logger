<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type TabItem = { value: string; label: string; content: Snippet };

  type Props = {
    items: TabItem[];
    value?: string;
    onValueChange?: (value: string) => void;
    class?: string;
  };

  let { items, value = $bindable(), onValueChange, class: className }: Props = $props();
  $effect(() => {
    if (value === undefined && items.length > 0) value = items[0].value;
  });

  function select(next: string): void {
    value = next;
    onValueChange?.(next);
  }

  function handleKey(event: KeyboardEvent, next: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(next);
    }
  }
</script>

<div data-slot="tabs" class={cn('flex flex-col gap-2', className)}>
  <div
    data-slot="tabs-list"
    role="tablist"
    class="inline-flex h-9 items-center justify-start gap-1 rounded-md bg-[color:var(--color-muted)] p-1 text-[color:var(--color-muted-foreground)]"
  >
    {#each items as item (item.value)}
      <button
        data-slot="tabs-trigger"
        type="button"
        role="tab"
        aria-selected={value === item.value}
        tabindex={value === item.value ? 0 : -1}
        onclick={() => select(item.value)}
        onkeydown={(e) => handleKey(e, item.value)}
        class={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]',
          value === item.value
            ? 'bg-[color:var(--color-background)] text-[color:var(--color-foreground)] shadow'
            : ''
        )}
      >
        {item.label}
      </button>
    {/each}
  </div>
  {#each items as item (item.value)}
    {#if value === item.value}
      <div data-slot="tabs-content" role="tabpanel">
        {@render item.content()}
      </div>
    {/if}
  {/each}
</div>
