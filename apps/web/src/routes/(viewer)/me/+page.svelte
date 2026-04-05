<script lang="ts">
  import Card from '$lib/components/ui/card.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Tooltip from '$lib/components/ui/tooltip.svelte';
  import type { AppUser } from '../../../app.d.ts';

  type PageData = { user: AppUser };
  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Profile · Prompt Logger</title>
</svelte:head>

<section class="flex max-w-2xl flex-col gap-5">
  <header class="flex flex-col gap-1.5">
    <h1 class="text-2xl font-semibold tracking-tight text-balance">Your profile</h1>
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      Account details and redeemed class codes.
    </p>
  </header>

  <Card class="p-6">
    <dl class="grid gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Email
        </dt>
        <dd class="mt-1 truncate text-sm font-medium">{data.user.email}</dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Display name
        </dt>
        <dd class="mt-1 truncate text-sm font-medium">
          {data.user.displayName ?? '—'}
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Role
        </dt>
        <dd class="mt-1">
          <Badge variant={data.user.role === 'admin' ? 'default' : 'secondary'}>
            {data.user.role}
          </Badge>
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          Accessible sessions
        </dt>
        <dd class="mt-1 text-sm font-medium tabular-nums">{data.user.accessibleSessionCount}</dd>
      </div>
    </dl>
  </Card>

  <Card class="p-6">
    <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Redeemed codes
    </h2>
    <p class="mt-3 text-sm">
      You have access to <span class="font-semibold tabular-nums">{data.user.accessibleTagCount}</span>
      class tag{data.user.accessibleTagCount === 1 ? '' : 's'}.
    </p>
    <p class="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
      A per-code breakdown arrives with plan&nbsp;004.
    </p>
    <div class="mt-4">
      <Button href="/join" variant="outline">Redeem a new code</Button>
    </div>
  </Card>

  <Card class="p-6">
    <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Danger zone
    </h2>
    <div class="mt-3 flex items-center gap-3">
      <Tooltip label="Contact the administrator">
        <Button variant="destructive" disabled aria-disabled="true">Delete my account</Button>
      </Tooltip>
    </div>
  </Card>
</section>
