<script lang="ts">
  /**
   * Small status pill with a pulsing dot. Animates only `opacity` + `transform`
   * scale per the CLAUDE.md performance rules — no `transition: all`.
   */
  type State = 'live' | 'reconnecting' | 'archived';

  type Props = { state: State; class?: string };

  const LABELS: Record<State, string> = {
    live: 'Live',
    reconnecting: 'Reconnecting',
    archived: 'Archived',
  };

  let { state, class: className = '' }: Props = $props();

  const dotClass = $derived(
    state === 'live'
      ? 'bg-emerald-500'
      : state === 'reconnecting'
        ? 'bg-amber-500'
        : 'bg-neutral-400'
  );
</script>

<span
  data-slot="live-pulse"
  class="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-2 py-0.5 text-xs font-medium {className}"
  role="status"
  aria-live="polite"
  aria-label={LABELS[state]}
>
  <span class="relative inline-flex h-2 w-2">
    {#if state !== 'archived'}
      <span
        class="absolute inline-flex h-full w-full rounded-full {dotClass} opacity-75"
        style:animation="pl-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite"
        aria-hidden="true"
      ></span>
    {/if}
    <span class="relative inline-flex h-2 w-2 rounded-full {dotClass}" aria-hidden="true"></span>
  </span>
  <span class="tabular-nums">{LABELS[state]}</span>
</span>

<style>
  @keyframes pl-ping {
    0% {
      transform: scale(1);
      opacity: 0.75;
    }
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }
</style>
