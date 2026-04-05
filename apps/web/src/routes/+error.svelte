<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/button.svelte';
  import Card from '$lib/components/ui/card.svelte';

  // SvelteKit's `App.Error` only guarantees `message` — we augment it with
  // an optional `requestId` surfaced by the server's error middleware.
  type AppError = { message: string; requestId?: string };

  let status = $derived(page.status);
  let error = $derived((page.error ?? { message: 'Unknown error' }) as AppError);
  let requestId = $derived(error.requestId);
  let humanMessage = $derived(
    status === 404
      ? 'The page you were looking for does not exist.'
      : status === 403
        ? 'You do not have permission to view this resource.'
        : status === 401
          ? 'You need to sign in to view this page.'
          : (error.message ?? 'Something went wrong.')
  );
</script>

<svelte:head>
  <title>Error {status} · Prompt Logger</title>
</svelte:head>

<section class="mx-auto flex min-h-[50vh] max-w-md items-center justify-center">
  <Card class="w-full p-6">
    <p class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)] tabular-nums">
      Error {status}
    </p>
    <h1 class="mt-1 text-xl font-semibold tracking-tight text-balance">{humanMessage}</h1>
    {#if requestId}
      <p class="mt-3 text-xs text-[color:var(--color-muted-foreground)]">
        Request ID: <code class="font-mono">{requestId}</code>
      </p>
    {/if}
    <div class="mt-5 flex gap-2">
      <Button href="/">Go home</Button>
    </div>
  </Card>
</section>
