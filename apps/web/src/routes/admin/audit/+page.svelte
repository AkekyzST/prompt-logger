<script lang="ts">
  import Badge from '$lib/components/ui/badge.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { AuditEntry } from '$lib/api/types.js';

  type EnrichedEntry = AuditEntry & { actorEmail: string | null };
  type PageData = { entries: EnrichedEntry[]; nextCursor: string | null };

  let { data }: { data: PageData } = $props();

  // Map the server's dot-separated action names to friendly labels.
  const ACTION_LABELS: Record<string, string> = {
    'session.update': 'Session updated',
    'session.delete': 'Session deleted',
    'grant.create': 'Grant added',
    'grant.delete': 'Grant removed',
    'user.create': 'User invited',
    'user.update': 'User updated',
    'user.delete': 'User removed',
    'code.create': 'Code created',
    'code.delete': 'Code deleted',
  };

  function labelFor(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  function targetHref(entry: EnrichedEntry): string | null {
    if (!entry.targetId) return null;
    switch (entry.targetType) {
      case 'session':
        return `/admin/sessions/${entry.targetId}`;
      case 'user':
        return '/admin/users';
      case 'code':
        return '/admin/codes';
      default:
        return null;
    }
  }

  function previewMetadata(metadata: Record<string, unknown> | null): string {
    if (!metadata) return '';
    try {
      const json = JSON.stringify(metadata);
      return json.length > 160 ? `${json.slice(0, 157)}…` : json;
    } catch {
      return '';
    }
  }

  function hasDiff(
    metadata: Record<string, unknown> | null
  ): metadata is Record<string, unknown> & { before: unknown; after: unknown } {
    return !!metadata && 'before' in metadata && 'after' in metadata;
  }
</script>

<svelte:head>
  <title>Audit log · Admin · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-5">
  <header class="flex flex-col gap-1.5">
    <h1 class="text-2xl font-semibold tracking-tight text-balance">Audit log</h1>
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      Every admin write is recorded here. Newest first.
    </p>
  </header>

  <div class="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
    <div class="w-full overflow-auto">
      <table class="w-full caption-bottom text-sm tabular-nums">
        <caption class="sr-only">Audit log entries</caption>
        <thead class="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">When</th>
            <th scope="col" class="px-3 py-2 font-medium">Actor</th>
            <th scope="col" class="px-3 py-2 font-medium">Action</th>
            <th scope="col" class="px-3 py-2 font-medium">Target</th>
            <th scope="col" class="px-3 py-2 font-medium">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as entry (entry.id)}
            {@const href = targetHref(entry)}
            <tr class="border-b border-[color:var(--color-border)] last:border-0 align-top">
              <td class="px-3 py-2 whitespace-nowrap"><Time iso={entry.createdAt} class="text-xs" /></td>
              <td class="px-3 py-2">
                <span class="block text-xs font-medium">{entry.actorEmail ?? entry.actorId}</span>
              </td>
              <td class="px-3 py-2"><Badge variant="outline">{labelFor(entry.action)}</Badge></td>
              <td class="px-3 py-2">
                {#if href && entry.targetId}
                  <a
                    href={href}
                    class="font-mono text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 rounded-sm"
                  >
                    {entry.targetType}/{entry.targetId}
                  </a>
                {:else}
                  <span class="font-mono text-xs text-[color:var(--color-muted-foreground)]">{entry.targetType}</span>
                {/if}
              </td>
              <td class="px-3 py-2">
                {#if hasDiff(entry.metadata)}
                  <details class="text-xs">
                    <summary class="cursor-pointer text-[color:var(--color-muted-foreground)]">before → after</summary>
                    <div class="mt-2 grid gap-2 sm:grid-cols-2">
                      <pre class="overflow-auto rounded border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-2 font-mono text-[11px]">{JSON.stringify(entry.metadata.before, null, 2)}</pre>
                      <pre class="overflow-auto rounded border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-2 font-mono text-[11px]">{JSON.stringify(entry.metadata.after, null, 2)}</pre>
                    </div>
                  </details>
                {:else if entry.metadata}
                  <pre class="max-w-md overflow-hidden truncate font-mono text-[11px] text-[color:var(--color-muted-foreground)]">{previewMetadata(entry.metadata)}</pre>
                {:else}
                  <span class="text-xs text-[color:var(--color-muted-foreground)]">—</span>
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-3 py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                No audit entries yet.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {#if data.nextCursor}
    <div class="flex justify-center">
      <Button href={`/admin/audit?cursor=${encodeURIComponent(data.nextCursor)}`} variant="outline">
        Load more
      </Button>
    </div>
  {/if}
</section>
