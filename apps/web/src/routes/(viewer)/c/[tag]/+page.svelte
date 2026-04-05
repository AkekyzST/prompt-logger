<script lang="ts">
  import Card from '$lib/components/ui/card.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import LivePulse from '$lib/components/LivePulse.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { Session } from '$lib/api/types.js';
  import type { AppUser } from '../../../../app.d.ts';

  type PageData = {
    tag: string;
    sessions: Session[];
    listingSupported: boolean;
    user: AppUser | null;
  };
  let { data }: { data: PageData } = $props();

  const sorted = $derived(
    [...data.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  );
</script>

<svelte:head>
  <title>#{data.tag} · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-5">
  <header class="flex flex-col gap-1.5">
    <p class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Class tag
    </p>
    <h1 class="text-3xl font-semibold tracking-tight text-balance">#{data.tag}</h1>
  </header>

  {#if sorted.length > 0}
    <ul class="flex flex-col gap-3">
      {#each sorted as session (session.id)}
        <li>
          <a
            href={`/s/${session.id}`}
            class="block rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-[color:var(--color-card-foreground)] shadow-sm transition-[box-shadow,border-color] hover:border-[color:var(--color-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="min-w-0 truncate text-base font-semibold tracking-tight text-balance">
                {session.title}
              </h2>
              {#if session.closedAt === null}
                <LivePulse state="live" />
              {:else}
                <LivePulse state="archived" />
              {/if}
            </div>
            {#if session.firstPromptPreview}
              <p class="mt-1.5 line-clamp-2 min-w-0 font-mono text-xs text-[color:var(--color-muted-foreground)]">
                {session.firstPromptPreview}
              </p>
            {/if}
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
              <Badge variant="outline">{session.visibility}</Badge>
              <span class="tabular-nums">#{session.seq}</span>
              <Time iso={session.updatedAt} class="text-xs" />
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {:else if data.listingSupported}
    <Card class="p-6">
      <p class="text-sm text-[color:var(--color-muted-foreground)]">
        No sessions yet for this class.
      </p>
    </Card>
  {:else}
    <Card class="p-6">
      <p class="text-sm text-[color:var(--color-muted-foreground)]">
        A personal session list for #{data.tag} arrives with plan&nbsp;004. For now, open sessions
        directly from the links shared by your instructor.
      </p>
      <div class="mt-4">
        <Button href="/join" variant="outline">Redeem another class code</Button>
      </div>
    </Card>
  {/if}
</section>
