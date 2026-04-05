<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts" module>
  import { tv, type VariantProps } from 'tailwind-variants';

  export const badgeVariants = tv({
    base: 'inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2',
    variants: {
      variant: {
        default:
          'border-transparent bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]',
        secondary:
          'border-transparent bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)]',
        destructive:
          'border-transparent bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)]',
        outline: 'text-[color:var(--color-foreground)]',
      },
    },
    defaultVariants: { variant: 'default' },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
    class?: string;
    children?: Snippet;
  };

  let { variant = 'default', class: className, children, ...rest }: Props = $props();
</script>

<span data-slot="badge" class={cn(badgeVariants({ variant }), className)} {...rest}>
  {#if children}{@render children()}{/if}
</span>
