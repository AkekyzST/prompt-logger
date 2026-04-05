<script lang="ts">
  /**
   * SSR-safe timestamp. Renders the absolute UTC string on the server (so the
   * initial HTML has useful content) and swaps to a relative label after
   * hydration. Wraps a `<time datetime="...">` for machine-readable semantics.
   */
  import { onMount } from 'svelte';
  import { formatAbsolute, formatRelative } from '$lib/format/time.js';

  type Props = { iso: string; class?: string };
  let { iso, class: className = '' }: Props = $props();

  let hydrated = $state(false);

  onMount(() => {
    hydrated = true;
  });

  const absolute = $derived(formatAbsolute(iso));
  const display = $derived(hydrated ? formatRelative(iso) : absolute);
</script>

<time
  datetime={iso}
  title={absolute}
  class="tabular-nums text-[color:var(--color-muted-foreground)] {className}"
>
  {display}
</time>
