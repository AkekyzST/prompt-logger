<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = HTMLAttributes<HTMLDivElement> & {
    orientation?: 'horizontal' | 'vertical';
    class?: string;
  };

  let { orientation = 'horizontal', class: className, ...rest }: Props = $props();
</script>

<div
  data-slot="separator"
  role="separator"
  aria-orientation={orientation}
  class={cn(
    'shrink-0 bg-[color:var(--color-border)]',
    orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
    className
  )}
  {...rest}
></div>
