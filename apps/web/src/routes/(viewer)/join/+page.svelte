<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/card.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Join a class · Prompt Logger</title>
</svelte:head>

<section class="mx-auto flex max-w-md flex-col gap-4">
  <header class="flex flex-col gap-1.5">
    <h1 class="text-2xl font-semibold tracking-tight text-balance">Join a class</h1>
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      Paste the class code your instructor shared to unlock their published sessions.
    </p>
  </header>

  <Card class="p-6">
    <form method="POST" use:enhance class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="code">Class code</Label>
        <Input
          id="code"
          name="code"
          required
          autocomplete="off"
          spellcheck={false}
          value={form?.code ?? ''}
          placeholder="cs101-fall26"
          aria-describedby={form?.error ? 'code-error' : undefined}
          aria-invalid={form?.error ? 'true' : undefined}
        />
        {#if form?.error}
          <p id="code-error" aria-live="polite" class="text-xs text-[color:var(--color-destructive)]">
            {form.error}
          </p>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <Button>Redeem code</Button>
        <Button href="/" variant="outline">Cancel</Button>
      </div>
    </form>
  </Card>
</section>
