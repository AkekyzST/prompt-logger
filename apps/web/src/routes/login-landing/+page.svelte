<script lang="ts">
  import Card from '$lib/components/ui/card.svelte';
  import Button from '$lib/components/ui/button.svelte';
</script>

<svelte:head>
  <title>Sign in · Prompt Logger</title>
</svelte:head>

<section class="mx-auto flex min-h-[60vh] max-w-md items-center justify-center">
  <Card class="w-full p-6">
    <h1 class="text-xl font-semibold tracking-tight text-balance">Sign in to view</h1>
    <p class="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
      This page is only visible to authorised viewers. Sign in with your organisation account to continue.
    </p>
    <div class="mt-5">
      <Button href="/login">Sign in</Button>
    </div>
  </Card>
</section>
