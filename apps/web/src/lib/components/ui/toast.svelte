<!-- vendored from shadcn-svelte — do not edit upstream; copy new version -->
<script lang="ts" module>
  type ToastVariant = 'default' | 'destructive';

  interface ToastItem {
    id: number;
    title: string;
    description?: string;
    variant: ToastVariant;
  }

  let counter = 0;
  const listeners = new Set<(items: ToastItem[]) => void>();
  let items: ToastItem[] = [];

  function emit(): void {
    for (const l of listeners) l(items);
  }

  export function toast(opts: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }): void {
    counter += 1;
    const id = counter;
    const item: ToastItem = {
      id,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? 'default',
    };
    items = [...items, item];
    emit();
    const duration = opts.durationMs ?? 4000;
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        items = items.filter((t) => t.id !== id);
        emit();
      }, duration);
    }
  }

  export function subscribe(listener: (items: ToastItem[]) => void): () => void {
    listeners.add(listener);
    listener(items);
    return () => {
      listeners.delete(listener);
    };
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { cn } from '$lib/utils';

  let list = $state<ToastItem[]>([]);

  onMount(() => subscribe((next) => (list = next)));
</script>

<div
  data-slot="toast-region"
  role="region"
  aria-live="polite"
  aria-label="Notifications"
  class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
>
  {#each list as t (t.id)}
    <div
      data-slot="toast"
      role="status"
      class={cn(
        'pointer-events-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-sm text-[color:var(--color-card-foreground)] shadow-lg',
        t.variant === 'destructive' &&
          'border-[color:var(--color-destructive)] text-[color:var(--color-destructive)]'
      )}
    >
      <p class="font-medium">{t.title}</p>
      {#if t.description}
        <p class="mt-1 text-[color:var(--color-muted-foreground)]">{t.description}</p>
      {/if}
    </div>
  {/each}
</div>
