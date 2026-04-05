<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes, HTMLTableAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = HTMLTableAttributes & {
    class?: string;
    caption?: Snippet;
    children?: Snippet;
  };

  let { class: className, caption, children, ...rest }: Props = $props();
</script>

<div data-slot="table-wrapper" class="relative w-full overflow-auto">
  <table
    data-slot="table"
    class={cn('w-full caption-bottom text-sm tabular-nums', className)}
    {...rest}
  >
    {#if caption}<caption class="mt-4 text-sm text-[color:var(--color-muted-foreground)]">
        {@render caption()}
      </caption>{/if}
    {#if children}{@render children()}{/if}
  </table>
</div>
