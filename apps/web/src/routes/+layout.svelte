<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import Toast from '$lib/components/ui/toast.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[color:var(--color-primary)] focus:px-3 focus:py-2 focus:text-[color:var(--color-primary-foreground)]"
>
  Skip to main content
</a>
<main id="main">
  {@render children()}
</main>
<Toast />
