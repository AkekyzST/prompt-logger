<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    title?: Snippet;
    description?: Snippet;
    children?: Snippet;
    footer?: Snippet;
    class?: string;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    title,
    description,
    children,
    footer,
    class: className,
  }: Props = $props();

  function close(): void {
    open = false;
    onOpenChange?.(false);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) close();
  }

  function handleOverlayKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') close();
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
  <!-- Overlay acts as a click-outside target; it's purely decorative so role="presentation". -->
  <div
    data-slot="dialog-overlay"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onclick={handleOverlayClick}
    onkeydown={handleOverlayKey}
    role="presentation"
  >
    <div
      data-slot="dialog-content"
      role="dialog"
      aria-modal="true"
      class={cn(
        'w-full max-w-lg rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6 text-[color:var(--color-card-foreground)] shadow-lg',
        className
      )}
    >
      {#if title}
        <h2 data-slot="dialog-title" class="text-lg font-semibold leading-none tracking-tight">
          {@render title()}
        </h2>
      {/if}
      {#if description}
        <p data-slot="dialog-description" class="mt-1.5 text-sm text-[color:var(--color-muted-foreground)]">
          {@render description()}
        </p>
      {/if}
      {#if children}
        <div class="mt-4">{@render children()}</div>
      {/if}
      {#if footer}
        <div data-slot="dialog-footer" class="mt-6 flex justify-end gap-2">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
