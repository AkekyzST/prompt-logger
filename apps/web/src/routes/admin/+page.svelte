<script lang="ts">
  import Card from '$lib/components/ui/card.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import LivePulse from '$lib/components/LivePulse.svelte';
  import Time from '$lib/components/Time.svelte';
  import VisibilityBadge from '$lib/components/admin/VisibilityBadge.svelte';
  import SessionActionsMenu from '$lib/components/admin/SessionActionsMenu.svelte';
  import type { Session } from '$lib/api/types.js';

  type PageData = {
    live: Session[];
    recent: Session[];
    stats: { sessionCount: number; promptCount: number; redactionCount: number };
  };

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Admin dashboard · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-6">
  <header class="flex flex-col gap-1.5">
    <p class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Admin
    </p>
    <h1 class="text-3xl font-semibold tracking-tight text-balance">Dashboard</h1>
  </header>

  <section aria-labelledby="live-heading" class="flex flex-col gap-3">
    <h2 id="live-heading" class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Live now
    </h2>
    {#if data.live.length > 0}
      <ul class="grid gap-3 sm:grid-cols-2">
        {#each data.live as session (session.id)}
          <li>
            <a
              href={`/admin/sessions/${session.id}`}
              class="block rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 transition-[box-shadow,border-color] hover:border-[color:var(--color-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
            >
              <div class="flex items-start justify-between gap-2">
                <h3 class="min-w-0 truncate text-base font-semibold">{session.title}</h3>
                <LivePulse state="live" />
              </div>
              <p class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
                {#if session.tag}
                  <Badge variant="secondary">{session.tag}</Badge>
                {/if}
                <span class="tabular-nums">#{session.seq} prompts</span>
                <Time iso={session.updatedAt} class="text-xs" />
              </p>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <Card class="p-6">
        <p class="text-sm text-[color:var(--color-muted-foreground)]">No live sessions right now.</p>
      </Card>
    {/if}
  </section>

  <section aria-labelledby="recent-heading" class="flex flex-col gap-3">
    <h2 id="recent-heading" class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Recent sessions
    </h2>
    <div class="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
      <div class="w-full overflow-auto">
        <table class="w-full caption-bottom text-sm tabular-nums">
          <caption class="sr-only">Last 20 sessions with quick actions</caption>
          <thead class="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
            <tr>
              <th scope="col" class="px-4 py-2 font-medium">Title</th>
              <th scope="col" class="px-4 py-2 font-medium">Tag</th>
              <th scope="col" class="px-4 py-2 font-medium">Visibility</th>
              <th scope="col" class="px-4 py-2 font-medium text-right">Prompts</th>
              <th scope="col" class="px-4 py-2 font-medium">Updated</th>
              <th scope="col" class="px-4 py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#each data.recent as session (session.id)}
              <tr class="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-accent)]/40">
                <td class="px-4 py-2">
                  <a
                    href={`/admin/sessions/${session.id}`}
                    class="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 rounded-sm"
                  >
                    {session.title}
                  </a>
                </td>
                <td class="px-4 py-2">
                  {#if session.tag}<Badge variant="outline">{session.tag}</Badge>{:else}<span class="text-xs text-[color:var(--color-muted-foreground)]">—</span>{/if}
                </td>
                <td class="px-4 py-2"><VisibilityBadge visibility={session.visibility} /></td>
                <td class="px-4 py-2 text-right">{session.seq}</td>
                <td class="px-4 py-2"><Time iso={session.updatedAt} class="text-xs" /></td>
                <td class="px-4 py-2 text-right">
                  <SessionActionsMenu {session} />
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="6" class="px-4 py-6 text-center text-sm text-[color:var(--color-muted-foreground)]">
                  No archived sessions yet.
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <Card class="p-6">
    <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      This week
    </h2>
    <p class="mt-2 text-sm">
      <span class="text-base font-semibold tabular-nums">{data.stats.sessionCount}</span>
      session{data.stats.sessionCount === 1 ? '' : 's'} ·
      <span class="text-base font-semibold tabular-nums">{data.stats.promptCount}</span>
      prompt{data.stats.promptCount === 1 ? '' : 's'} ·
      <span class="text-base font-semibold tabular-nums">{data.stats.redactionCount}</span>
      secret{data.stats.redactionCount === 1 ? '' : 's'} caught
    </p>
  </Card>
</section>
