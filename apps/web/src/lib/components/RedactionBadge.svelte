<script lang="ts">
  /**
   * Shows "{N} secrets stripped" when a prompt had redactions applied. Hover
   * reveals the redaction types — never the values.
   */
  import Tooltip from '$lib/components/ui/tooltip.svelte';
  import type { Redaction } from '$lib/api/types.js';

  type Props = { redactions: Redaction[] | null };
  let { redactions }: Props = $props();

  const list = $derived(redactions ?? []);
  const total = $derived(list.length);
  const types = $derived(
    Array.from(new Set(list.map((r) => r.type)))
      .sort()
      .join(', ')
  );
  const label = $derived(total > 0 ? `${total} secret${total === 1 ? '' : 's'} stripped` : '');
</script>

{#if total > 0}
  <Tooltip label={types || 'redacted'}>
    <span
      data-slot="redaction-badge"
      class="inline-flex items-center rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-700 tabular-nums dark:text-amber-300"
      aria-label={label}
    >
      {label}
    </span>
  </Tooltip>
{/if}
