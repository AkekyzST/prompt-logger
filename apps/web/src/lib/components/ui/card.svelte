<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
    class?: string;
    header?: Snippet;
    title?: Snippet;
    description?: Snippet;
    content?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  };

  let {
    class: className,
    header,
    title,
    description,
    content,
    footer,
    children,
    ...rest
  }: Props = $props();
</script>

<div
  data-slot="card"
  class={cn(
    'rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-card-foreground)] shadow-sm',
    className
  )}
  {...rest}
>
  {#if header || title || description}
    <div data-slot="card-header" class="flex flex-col gap-1.5 p-6">
      {#if title}
        <h3 data-slot="card-title" class="text-lg font-semibold leading-none tracking-tight">
          {@render title()}
        </h3>
      {/if}
      {#if description}
        <p data-slot="card-description" class="text-sm text-[color:var(--color-muted-foreground)]">
          {@render description()}
        </p>
      {/if}
      {#if header}{@render header()}{/if}
    </div>
  {/if}
  {#if content}
    <div data-slot="card-content" class="p-6 pt-0">{@render content()}</div>
  {/if}
  {#if children}
    <div data-slot="card-content" class="p-6 pt-0">{@render children()}</div>
  {/if}
  {#if footer}
    <div data-slot="card-footer" class="flex items-center p-6 pt-0">
      {@render footer()}
    </div>
  {/if}
</div>
