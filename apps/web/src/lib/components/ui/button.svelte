<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts" module>
  import { tv, type VariantProps } from 'tailwind-variants';

  export const buttonVariants = tv({
    base: 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-background)]',
    variants: {
      variant: {
        default:
          'bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)] hover:opacity-90',
        destructive:
          'bg-[color:var(--color-destructive)] text-[color:var(--color-destructive-foreground)] hover:opacity-90',
        outline:
          'border border-[color:var(--color-border)] bg-transparent hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)]',
        secondary:
          'bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)] hover:opacity-90',
        ghost:
          'hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)]',
        link: 'text-[color:var(--color-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
  export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type CommonProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
    children?: Snippet;
  };

  type Props =
    | (CommonProps & { href: string } & Omit<HTMLAnchorAttributes, 'class' | 'children'>)
    | (CommonProps & { href?: undefined } & Omit<HTMLButtonAttributes, 'class' | 'children'>);

  let { variant = 'default', size = 'default', class: className, children, ...rest }: Props = $props();
</script>

{#if 'href' in rest && rest.href !== undefined}
  <a data-slot="button" class={cn(buttonVariants({ variant, size }), className)} {...rest as HTMLAnchorAttributes}>
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <button data-slot="button" type="button" class={cn(buttonVariants({ variant, size }), className)} {...rest as HTMLButtonAttributes}>
    {#if children}{@render children()}{/if}
  </button>
{/if}
