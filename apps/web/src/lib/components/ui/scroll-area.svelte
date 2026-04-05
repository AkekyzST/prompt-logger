<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = HTMLAttributes<HTMLDivElement> & {
    class?: string;
    children?: Snippet;
  };

  let { class: className, children, ...rest }: Props = $props();
</script>

<div
  data-slot="scroll-area"
  class={cn(
    'relative overflow-auto rounded-md [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-border)]',
    className
  )}
  {...rest}
>
  {#if children}{@render children()}{/if}
</div>
