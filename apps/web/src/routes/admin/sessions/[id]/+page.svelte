<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/card.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import Time from '$lib/components/Time.svelte';
  import RedactionBadge from '$lib/components/RedactionBadge.svelte';
  import VisibilityBadge from '$lib/components/admin/VisibilityBadge.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import GrantsPanel from './GrantsPanel.svelte';
  import type { Prompt, Session } from '$lib/api/types.js';
  import type { ActionData } from './$types.js';

  type Grant = { userId: string; email: string | null; displayName: string | null };
  type PageData = { session: Session; prompts: Prompt[]; grants: Grant[] };

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let deleteOpen = $state(false);
</script>

<svelte:head>
  <title>{data.session.title} · Admin · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-6">
  <header class="flex flex-col gap-2">
    <p class="text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      <a href="/admin/sessions" class="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] rounded-sm">Sessions</a>
      / Edit
    </p>
    <h1 class="text-2xl font-semibold tracking-tight text-balance">{data.session.title}</h1>
    <p class="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
      <VisibilityBadge visibility={data.session.visibility} />
      {#if data.session.tag}<Badge variant="outline">{data.session.tag}</Badge>{/if}
      <span class="tabular-nums">{data.prompts.length} prompts</span>
      <Time iso={data.session.createdAt} class="text-xs" />
      {#if data.session.closedAt}
        <Badge variant="secondary">closed</Badge>
      {/if}
    </p>
  </header>

  {#if form && 'updated' in form && form.updated}
    <p role="status" aria-live="polite" class="text-xs text-[color:var(--color-muted-foreground)]">
      Changes saved.
    </p>
  {/if}
  {#if form && 'error' in form && form.error}
    <p role="alert" aria-live="polite" class="text-xs text-[color:var(--color-destructive)]">{form.error}</p>
  {/if}

  <Card class="p-6" id="rename">
    <form method="POST" action="?/update" use:enhance class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="title">Title</Label>
        <Input id="title" name="title" required value={data.session.title} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="tag">Tag</Label>
        <Input id="tag" name="tag" value={data.session.tag ?? ''} placeholder="cs101-fall26" autocomplete="off" spellcheck={false} />
      </div>
      <fieldset class="flex flex-col gap-2" id="visibility">
        <legend class="text-sm font-medium">Visibility</legend>
        {#each ['private', 'shared', 'code'] as v (v)}
          <label class="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="visibility" value={v} checked={data.session.visibility === v} />
            <span class="capitalize">{v}</span>
          </label>
        {/each}
      </fieldset>
      <div class="flex items-center gap-2">
        <Button type="submit">Save changes</Button>
        {#if data.session.closedAt === null}
          <Button type="submit" name="closeNow" value="1" variant="outline">Close session now</Button>
        {/if}
      </div>
    </form>
  </Card>

  <Card class="p-6">
    <GrantsPanel grants={data.grants} />
  </Card>

  <section aria-labelledby="prompts-heading" class="flex flex-col gap-3">
    <h2 id="prompts-heading" class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
      Prompts
    </h2>
    <ul class="flex flex-col gap-3">
      {#each data.prompts as prompt (prompt.id)}
        <li
          class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-[color:var(--color-card-foreground)]"
        >
          <header class="mb-2 flex items-center gap-2 text-xs text-[color:var(--color-muted-foreground)]">
            <span class="font-mono tabular-nums">#{prompt.seq}</span>
            <Time iso={prompt.createdAt} class="text-xs" />
            <RedactionBadge redactions={prompt.redactions} />
            <!-- TODO(plan-004): Purge-prompt admin endpoint does not exist on
                 the server yet. When it lands, replace this comment with a
                 POST action that PATCHes content to "[REMOVED BY ADMIN]". -->
          </header>
          <pre class="whitespace-pre-wrap break-words font-mono text-sm">{prompt.content}</pre>
        </li>
      {:else}
        <li class="rounded-lg border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-muted-foreground)]">
          No prompts in this session.
        </li>
      {/each}
    </ul>
  </section>

  <Card class="p-6" id="danger">
    <h2 class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-destructive)]">
      Danger zone
    </h2>
    <p class="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
      Deleting a session removes every prompt, grant, and audit entry. This cannot be undone.
    </p>
    <div class="mt-4">
      <Button variant="destructive" onclick={() => (deleteOpen = true)}>Delete session</Button>
    </div>
  </Card>
</section>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  onOpenChange={(v) => (deleteOpen = v)}
  heading="Delete this session?"
  body="Type the session title to confirm. This is permanent."
  confirmPhrase={data.session.title}
  confirmLabel="Delete session"
  action="?/delete"
>
  {#snippet hiddenFields()}
    <input type="hidden" name="expected" value={data.session.title} />
  {/snippet}
</ConfirmDeleteDialog>
