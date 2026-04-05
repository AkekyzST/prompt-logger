<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/card.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import Time from '$lib/components/Time.svelte';
  import VisibilityBadge from '$lib/components/admin/VisibilityBadge.svelte';
  import type { Session } from '$lib/api/types.js';
  import type { ActionData } from './$types.js';

  type PageData = {
    sessions: Session[];
    nextCursor: string | null;
    q: string;
    tag: string;
    availableTags: string[];
  };

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let selected = $state<Set<string>>(new Set());
  const selectedIds = $derived(Array.from(selected));
  const allChecked = $derived(
    data.sessions.length > 0 && selected.size === data.sessions.length
  );

  function toggleAll(checked: boolean): void {
    if (checked) selected = new Set(data.sessions.map((s) => s.id));
    else selected = new Set();
  }

  function toggleRow(id: string, checked: boolean): void {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    selected = next;
  }

  // Preserve the current q/tag on the Load-more link so pagination carries filters.
  const loadMoreHref = $derived(
    (() => {
      if (!data.nextCursor) return null;
      const u = new URLSearchParams();
      if (data.q) u.set('q', data.q);
      if (data.tag) u.set('tag', data.tag);
      u.set('cursor', data.nextCursor);
      return `/admin/sessions?${u.toString()}`;
    })()
  );
</script>

<svelte:head>
  <title>Sessions · Admin · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-5">
  <header class="flex flex-col gap-1.5">
    <h1 class="text-2xl font-semibold tracking-tight text-balance">Sessions</h1>
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      Search, filter, and bulk-manage every logged session.
    </p>
  </header>

  <Card class="p-4">
    <form method="GET" class="flex flex-wrap items-end gap-3">
      <div class="flex min-w-[14rem] flex-1 flex-col gap-1.5">
        <Label for="q">Search prompts</Label>
        <Input id="q" name="q" type="search" value={data.q} placeholder="free-text FTS…" autocomplete="off" spellcheck={false} />
      </div>
      <div class="flex min-w-[10rem] flex-col gap-1.5">
        <Label for="tag">Tag</Label>
        <select
          id="tag"
          name="tag"
          value={data.tag}
          class="flex h-9 w-full rounded-md border border-[color:var(--color-input)] bg-[color:var(--color-background)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
        >
          <option value="">All tags</option>
          {#each data.availableTags as t (t)}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </div>
      <div class="flex gap-2">
        <Button type="submit" variant="default">Apply</Button>
        <Button href="/admin/sessions" variant="outline">Clear</Button>
      </div>
    </form>
  </Card>

  {#if form?.error}
    <p role="alert" aria-live="polite" class="text-xs text-[color:var(--color-destructive)]">{form.error}</p>
  {/if}
  {#if form?.bulk}
    <p role="status" aria-live="polite" class="text-xs text-[color:var(--color-muted-foreground)]">
      Applied {form.bulk.applied} row{form.bulk.applied === 1 ? '' : 's'}{form.bulk.failed ? `, ${form.bulk.failed} failed` : ''}.
    </p>
  {/if}

  {#if selected.size > 0}
    <div
      role="region"
      aria-label="Bulk actions"
      class="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3"
    >
      <span class="text-sm font-medium">{selected.size} selected</span>
      <span class="flex-1"></span>
      <form method="POST" action="?/bulkSetVisibility" use:enhance class="contents">
        {#each selectedIds as id (id)}
          <input type="hidden" name="ids" value={id} />
        {/each}
        <Button type="submit" name="visibility" value="shared" variant="outline">Set shared</Button>
        <Button type="submit" name="visibility" value="code" variant="outline">Set code</Button>
        <Button type="submit" name="visibility" value="private" variant="outline">Set private</Button>
      </form>
      <form method="POST" action="?/bulkDelete" use:enhance class="contents">
        {#each selectedIds as id (id)}
          <input type="hidden" name="ids" value={id} />
        {/each}
        <Button type="submit" variant="destructive">Delete</Button>
      </form>
    </div>
  {/if}

  <div class="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
    <div class="w-full overflow-auto">
      <table class="w-full caption-bottom text-sm tabular-nums">
        <caption class="sr-only">Admin sessions list with bulk selection and per-row links</caption>
        <thead class="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          <tr>
            <th scope="col" class="w-10 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all rows"
                checked={allChecked}
                onchange={(e) => toggleAll((e.currentTarget as HTMLInputElement).checked)}
              />
            </th>
            <th scope="col" class="px-3 py-2 font-medium">Title</th>
            <th scope="col" class="px-3 py-2 font-medium">Tag</th>
            <th scope="col" class="px-3 py-2 font-medium">Visibility</th>
            <th scope="col" class="px-3 py-2 font-medium text-right">Prompts</th>
            <th scope="col" class="px-3 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sessions as session (session.id)}
            <tr class="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-accent)]/40">
              <td class="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${session.title}`}
                  checked={selected.has(session.id)}
                  onchange={(e) => toggleRow(session.id, (e.currentTarget as HTMLInputElement).checked)}
                />
              </td>
              <td class="px-3 py-2">
                <a
                  href={`/admin/sessions/${session.id}`}
                  class="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 rounded-sm"
                >
                  {session.title}
                </a>
              </td>
              <td class="px-3 py-2">
                {#if session.tag}<Badge variant="outline">{session.tag}</Badge>{:else}<span class="text-xs text-[color:var(--color-muted-foreground)]">—</span>{/if}
              </td>
              <td class="px-3 py-2"><VisibilityBadge visibility={session.visibility} /></td>
              <td class="px-3 py-2 text-right">{session.seq}</td>
              <td class="px-3 py-2"><Time iso={session.createdAt} class="text-xs" /></td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-3 py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                No sessions match these filters.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {#if loadMoreHref}
    <div class="flex justify-center">
      <Button href={loadMoreHref} variant="outline">Load more</Button>
    </div>
  {/if}
</section>
