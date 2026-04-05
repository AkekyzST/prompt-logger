<script lang="ts">
  /**
   * One-click copy button with clipboard-API + textarea fallback. Flashes a
   * check icon for 1.5s and toasts on both success and failure.
   */
  import { Check, Copy } from 'lucide-svelte';
  import { toast } from '$lib/components/ui/toast.svelte';
  import { cn } from '$lib/utils';

  type Variant = 'icon' | 'inline';

  type Props = {
    text: string;
    label: string;
    variant?: Variant;
    class?: string;
  };

  let { text, label, variant = 'icon', class: className }: Props = $props();

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function doCopy(): Promise<void> {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok && typeof document !== 'undefined') {
      // Legacy fallback for non-secure contexts.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      copied = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        copied = false;
      }, 1500);
      toast({ title: 'Copied to clipboard' });
    } else {
      toast({ title: 'Copy failed', description: 'Clipboard unavailable', variant: 'destructive' });
    }
  }
</script>

{#if variant === 'inline'}
  <button
    type="button"
    aria-label={label}
    onclick={doCopy}
    class={cn(
      'inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border)] bg-transparent px-2.5 text-xs font-medium transition-[color,background-color,opacity] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2',
      className
    )}
  >
    {#if copied}
      <Check class="h-3.5 w-3.5" aria-hidden="true" />
      <span>Copied</span>
    {:else}
      <Copy class="h-3.5 w-3.5" aria-hidden="true" />
      <span>Copy</span>
    {/if}
  </button>
{:else}
  <button
    type="button"
    aria-label={label}
    onclick={doCopy}
    class={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-transparent text-[color:var(--color-foreground)] transition-[color,background-color,opacity] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2',
      className
    )}
  >
    {#if copied}
      <Check class="h-4 w-4" aria-hidden="true" />
    {:else}
      <Copy class="h-4 w-4" aria-hidden="true" />
    {/if}
  </button>
{/if}
