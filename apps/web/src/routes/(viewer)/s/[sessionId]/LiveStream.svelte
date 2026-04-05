<script lang="ts">
  /**
   * Client-only island for the live prompt feed. Owns the reactive list of
   * prompts, the EventSource subscription, auto-scroll bookkeeping, and
   * keyboard navigation (j/k/c/gg/G/?). The server-rendered static list is
   * replaced by this component after hydration.
   *
   * Virtualization: plain `{#each}` for ≤100 prompts. Above that, the VList
   * from `virtua/svelte` takes over on the client only.
   */
  import { browser } from '$app/environment';
  import { onDestroy, onMount, tick } from 'svelte';
  import { VList } from 'virtua/svelte';
  import PromptCard from './PromptCard.svelte';
  import KeyboardShortcuts from './KeyboardShortcuts.svelte';
  import LivePulse from '$lib/components/LivePulse.svelte';
  import type { Prompt } from '$lib/api/types.js';

  type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'archived' | 'lost';

  type Props = {
    sessionId: string;
    prompts: Prompt[];
    archived: boolean;
  };

  let { sessionId, prompts, archived }: Props = $props();

  // Intentional initial snapshot — the client list diverges from the prop
  // after mount via SSE, so capturing the initial value is correct here.
  // svelte-ignore state_referenced_locally
  let list = $state<Prompt[]>([...prompts]);
  let connectionState = $state<ConnectionState>('connecting');
  let shortcutsOpen = $state(false);
  let focusedIndex = $state<number>(-1);
  let autoFollow = $state(true);
  let retries = 0;
  const MAX_RETRIES = 10;

  let containerEl = $state<HTMLDivElement | null>(null);
  let source: EventSource | null = null;
  let lastGKey = 0;

  const pulseState = $derived<'live' | 'reconnecting' | 'archived'>(
    connectionState === 'live'
      ? 'live'
      : connectionState === 'archived' || connectionState === 'lost'
        ? 'archived'
        : 'reconnecting'
  );

  function upsertPrompt(p: Prompt): void {
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx === -1) {
      list = [...list, p];
    }
  }

  function reconcileSnapshot(incoming: Prompt[]): void {
    const byId = new Map<string, Prompt>();
    for (const p of list) byId.set(p.id, p);
    for (const p of incoming) byId.set(p.id, p);
    list = Array.from(byId.values()).sort((a, b) => a.seq - b.seq);
  }

  function scrollToBottom(): void {
    if (!browser || !containerEl) return;
    containerEl.scrollTop = containerEl.scrollHeight;
  }

  function handleScroll(): void {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    autoFollow = distanceFromBottom < 64;
  }

  async function afterAppend(): Promise<void> {
    await tick();
    if (autoFollow) scrollToBottom();
  }

  function openStream(): void {
    if (!browser) return;
    if (archived) {
      connectionState = 'archived';
      return;
    }

    try {
      source = new EventSource(`/api/stream/${sessionId}`);
    } catch {
      connectionState = 'lost';
      return;
    }

    source.addEventListener('open', () => {
      connectionState = 'live';
      retries = 0;
    });

    source.addEventListener('snapshot', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { prompts: Prompt[] };
        reconcileSnapshot(payload.prompts ?? []);
        void afterAppend();
      } catch {
        // Malformed payload — ignore and wait for the next event.
      }
    });

    source.addEventListener('prompt', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as Prompt & {
          session_id?: string;
          created_at?: string;
        };
        // Normalise server snake_case → camelCase on the fields we consume.
        const prompt: Prompt = {
          id: payload.id,
          sessionId: (payload as { session_id?: string }).session_id ?? sessionId,
          seq: payload.seq,
          role: payload.role ?? 'user',
          content: payload.content,
          redactions: payload.redactions ?? null,
          createdAt:
            (payload as { created_at?: string }).created_at ??
            (payload as { createdAt?: string }).createdAt ??
            new Date().toISOString(),
        };
        upsertPrompt(prompt);
        void afterAppend();
      } catch {
        // ignore malformed frames
      }
    });

    source.addEventListener('close', () => {
      connectionState = 'archived';
      source?.close();
      source = null;
    });

    source.onerror = (): void => {
      retries += 1;
      if (retries >= MAX_RETRIES) {
        connectionState = 'lost';
        source?.close();
        source = null;
      } else {
        connectionState = 'reconnecting';
      }
    };
  }

  function focusIndex(i: number): void {
    if (list.length === 0) return;
    const clamped = Math.max(0, Math.min(list.length - 1, i));
    focusedIndex = clamped;

    // For non-virtualized rendering, the card's $effect will call focus().
    // For virtualized rendering we also need to scroll-to-index.
    if (list.length > 100 && browser) {
      virtualRef?.scrollToIndex(clamped, { align: 'nearest' });
    }
  }

  async function copyFocused(): Promise<void> {
    if (focusedIndex < 0 || focusedIndex >= list.length) return;
    const text = list[focusedIndex]?.content ?? '';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* ignore */
    }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function handleKey(ev: KeyboardEvent): void {
    if (ev.defaultPrevented) return;
    if (isTypingTarget(ev.target)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    switch (ev.key) {
      case 'j':
        ev.preventDefault();
        focusIndex(focusedIndex < 0 ? 0 : focusedIndex + 1);
        break;
      case 'k':
        ev.preventDefault();
        focusIndex(focusedIndex < 0 ? list.length - 1 : focusedIndex - 1);
        break;
      case 'c':
        ev.preventDefault();
        void copyFocused();
        break;
      case 'G':
        ev.preventDefault();
        focusIndex(list.length - 1);
        break;
      case 'g': {
        ev.preventDefault();
        const now = Date.now();
        if (now - lastGKey < 500) {
          focusIndex(0);
          lastGKey = 0;
        } else {
          lastGKey = now;
        }
        break;
      }
      case '?':
        ev.preventDefault();
        shortcutsOpen = true;
        break;
    }
  }

  // Virtual list ref — imperatively scroll to an index on j/k when needed.
  let virtualRef = $state<{
    scrollToIndex: (i: number, o?: { align?: 'start' | 'end' | 'nearest' }) => void;
  } | null>(null);

  onMount(() => {
    openStream();
    window.addEventListener('keydown', handleKey);
    // Give the SSR list a moment to lay out, then pin to bottom.
    void afterAppend();
  });

  onDestroy(() => {
    if (browser) {
      window.removeEventListener('keydown', handleKey);
    }
    if (source) {
      source.close();
      source = null;
    }
  });
</script>

<div class="flex items-center gap-2">
  <LivePulse state={pulseState} />
  <button
    type="button"
    onclick={() => (shortcutsOpen = true)}
    class="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-transparent px-2.5 text-xs font-medium hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
    aria-label="Show keyboard shortcuts"
  >
    Shortcuts
    <kbd class="font-mono text-[10px] text-[color:var(--color-muted-foreground)]">?</kbd>
  </button>
</div>

{#if connectionState === 'lost'}
  <div
    role="alert"
    class="mt-4 rounded-md border border-[color:var(--color-destructive)] bg-[color:var(--color-destructive)]/10 p-3 text-sm text-[color:var(--color-destructive)]"
  >
    Connection lost after {MAX_RETRIES} retries.
    <button
      type="button"
      class="ml-2 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
      onclick={() => {
        if (browser) window.location.reload();
      }}>Reload</button
    >
  </div>
{/if}

<div
  bind:this={containerEl}
  onscroll={handleScroll}
  role="log"
  aria-live="polite"
  aria-label="Session prompts"
  class="mt-4 flex max-h-[calc(100vh-14rem)] flex-col gap-3 overflow-y-auto pr-1 focus-visible:outline-none"
>
  {#if list.length > 100 && browser}
    <VList data={list} bind:this={virtualRef} style="height: 100%;">
      {#snippet children(item: Prompt, index: number)}
        <div class="pb-3">
          <PromptCard prompt={item} focused={index === focusedIndex} />
        </div>
      {/snippet}
    </VList>
  {:else}
    {#each list as prompt, i (prompt.id)}
      <PromptCard {prompt} focused={i === focusedIndex} />
    {/each}
  {/if}

  {#if list.length === 0}
    <p class="py-12 text-center text-sm text-[color:var(--color-muted-foreground)]">
      No prompts yet. They will appear here as they are logged.
    </p>
  {/if}
</div>

<KeyboardShortcuts bind:open={shortcutsOpen} onOpenChange={(v) => (shortcutsOpen = v)} />
