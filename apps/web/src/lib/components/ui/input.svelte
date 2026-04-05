<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = HTMLInputAttributes & {
    class?: string;
    value?: string | number | null;
  };

  let { class: className, value = $bindable(''), ...rest }: Props = $props();
</script>

<input
  data-slot="input"
  bind:value
  class={cn(
    'flex h-9 w-full rounded-md border border-[color:var(--color-input)] bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[color:var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50',
    className
  )}
  {...rest}
/>
