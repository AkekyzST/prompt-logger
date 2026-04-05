<script lang="ts">
  import { KeyRound, Sparkles, User as UserIcon } from 'lucide-svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Card from '$lib/components/ui/card.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import type { AppUser } from '../../app.d.ts';

  type PageData = { user: AppUser | null };
  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-6">
  <header class="flex flex-col gap-1.5">
    <h1 class="text-3xl font-semibold tracking-tight text-balance">Welcome back</h1>
    {#if data.user}
      <p class="text-sm text-[color:var(--color-muted-foreground)]">
        Signed in as <span class="font-medium text-[color:var(--color-foreground)]">{data.user.email}</span>
      </p>
    {/if}
  </header>

  <div class="grid gap-4 sm:grid-cols-2">
    <Card class="p-6">
      <div class="flex items-center gap-2">
        <Sparkles class="h-4 w-4 text-[color:var(--color-primary)]" aria-hidden="true" />
        <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Your classes
        </h2>
      </div>
      <p class="mt-3 text-4xl font-semibold tabular-nums">
        {data.user?.accessibleTagCount ?? 0}
      </p>
      <p class="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
        {data.user?.accessibleSessionCount ?? 0} session{(data.user?.accessibleSessionCount ?? 0) === 1 ? '' : 's'} accessible
      </p>
      <div class="mt-5">
        <Button href="/join" variant="default">
          <KeyRound class="h-4 w-4" aria-hidden="true" />
          Join a class
        </Button>
      </div>
    </Card>

    <Card class="p-6">
      <div class="flex items-center gap-2">
        <UserIcon class="h-4 w-4 text-[color:var(--color-primary)]" aria-hidden="true" />
        <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Your account
        </h2>
      </div>
      {#if data.user}
        <p class="mt-3 truncate text-base font-medium">{data.user.displayName ?? data.user.email}</p>
        <div class="mt-1">
          <Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'}>{data.user.role}</Badge>
        </div>
      {/if}
      <div class="mt-5">
        <Button href="/me" variant="outline">Open profile</Button>
      </div>
    </Card>
  </div>

  <Card class="p-6">
    <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Recent sessions
    </h2>
    <p class="mt-3 text-sm text-[color:var(--color-muted-foreground)]">
      Open a session from a shared link or paste a class code to join a class. A personal "recent
      sessions" list arrives with plan 004.
    </p>
  </Card>
</section>
