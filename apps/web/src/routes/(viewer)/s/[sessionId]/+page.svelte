<script lang="ts">
  import Badge from '$lib/components/ui/badge.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import LiveStream from './LiveStream.svelte';
  import type { Prompt, Session } from '$lib/api/types.js';

  type PageData = {
    session: Session;
    prompts: Prompt[];
  };

  let { data }: { data: PageData } = $props();

  const bulkText = $derived(data.prompts.map((p) => p.content).join('\n\n'));
  const archived = $derived(data.session.closedAt !== null);
</script>

<svelte:head>
  <title>{data.session.title} · Prompt Logger</title>
</svelte:head>

<article class="flex flex-col gap-5">
  <header class="flex flex-col gap-3 border-b border-[color:var(--color-border)] pb-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl font-semibold tracking-tight text-balance">
          {data.session.title}
        </h1>
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
          {#if data.session.tag}
            <Badge variant="secondary">{data.session.tag}</Badge>
          {/if}
          <span class="tabular-nums">
            {data.prompts.length} prompt{data.prompts.length === 1 ? '' : 's'}
          </span>
          {#if data.session.cwd}
            <span class="truncate font-mono" title={data.session.cwd}>{data.session.cwd}</span>
          {/if}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <CopyButton text={bulkText} label="Copy all prompts" variant="inline" />
      </div>
    </div>
  </header>

  <!-- Static SSR fallback list (hidden once the client island mounts but
       rendered in the initial HTML so first paint is complete and search
       engines / JS-disabled users still see content). -->
  <noscript>
    <div class="flex flex-col gap-3">
      {#each data.prompts as prompt (prompt.id)}
        <article
          class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-[color:var(--color-card-foreground)]"
        >
          <header class="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
            <span class="font-mono tabular-nums">#{prompt.seq}</span>
            <time datetime={prompt.createdAt} class="tabular-nums">{prompt.createdAt}</time>
          </header>
          <pre class="whitespace-pre-wrap break-words font-mono text-sm">{prompt.content}</pre>
        </article>
      {/each}
    </div>
  </noscript>

  <LiveStream sessionId={data.session.id} prompts={data.prompts} {archived} />
</article>
