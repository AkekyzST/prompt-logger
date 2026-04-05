<script lang="ts">
  import { enhance } from '$app/forms';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Dialog from '$lib/components/ui/dialog.svelte';
  import Time from '$lib/components/Time.svelte';
  import CopyButton from '$lib/components/CopyButton.svelte';
  import type { ClassCode } from '$lib/api/types.js';
  import type { ActionData } from './$types.js';

  type PageData = { codes: ClassCode[]; nextCursor: string | null; baseUrl: string };
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let createOpen = $state(false);
  let codeInput = $state('');
  let tagInput = $state('');

  // Auto-suggest the code slug from the tag as the admin types.
  function suggestFromTag(tag: string): string {
    return tag
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function onTagInput(e: Event): void {
    const next = (e.currentTarget as HTMLInputElement).value;
    tagInput = next;
    if (!codeInput || codeInput === suggestFromTag(tagInput.slice(0, -1))) {
      codeInput = suggestFromTag(next);
    }
  }
</script>

<svelte:head>
  <title>Class codes · Admin · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-5">
  <header class="flex items-center justify-between gap-3">
    <div class="flex flex-col gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight text-balance">Class codes</h1>
      <p class="text-sm text-[color:var(--color-muted-foreground)]">
        Share a code to grant viewers access to every session tagged that way.
      </p>
    </div>
    <Button onclick={() => (createOpen = true)}>Create code</Button>
  </header>

  {#if form && 'error' in form && form.error}
    <p role="alert" aria-live="polite" class="text-xs text-[color:var(--color-destructive)]">{form.error}</p>
  {/if}
  {#if form && 'created' in form && form.created}
    <p role="status" aria-live="polite" class="text-xs text-[color:var(--color-muted-foreground)]">
      Created {form.created}.
    </p>
  {/if}

  <div class="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
    <div class="w-full overflow-auto">
      <table class="w-full caption-bottom text-sm tabular-nums">
        <caption class="sr-only">Class codes with share link and delete actions</caption>
        <thead class="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">Code</th>
            <th scope="col" class="px-3 py-2 font-medium">Tag</th>
            <th scope="col" class="px-3 py-2 font-medium">Label</th>
            <th scope="col" class="px-3 py-2 font-medium">Expires</th>
            <th scope="col" class="px-3 py-2 font-medium text-right">Share</th>
            <th scope="col" class="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.codes as c (c.code)}
            {@const shareUrl = `${data.baseUrl}/join/${encodeURIComponent(c.code)}`}
            <tr class="border-b border-[color:var(--color-border)] last:border-0">
              <td class="px-3 py-2 font-mono">{c.code}</td>
              <td class="px-3 py-2">{c.tag}</td>
              <td class="px-3 py-2 text-[color:var(--color-muted-foreground)]">{c.label ?? '—'}</td>
              <td class="px-3 py-2">
                {#if c.expiresAt}<Time iso={c.expiresAt} class="text-xs" />{:else}<span class="text-xs text-[color:var(--color-muted-foreground)]">never</span>{/if}
              </td>
              <td class="px-3 py-2 text-right">
                <CopyButton text={shareUrl} label={`Copy share link for ${c.code}`} variant="inline" />
              </td>
              <td class="px-3 py-2 text-right">
                <form method="POST" action="?/delete" use:enhance>
                  <input type="hidden" name="code" value={c.code} />
                  <Button type="submit" variant="destructive" size="sm">Delete</Button>
                </form>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-3 py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                No class codes yet.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</section>

<Dialog bind:open={createOpen} onOpenChange={(v) => (createOpen = v)}>
  {#snippet title()}Create a class code{/snippet}
  {#snippet description()}Codes grant access to every session tagged with the same tag.{/snippet}
  {#snippet children()}
    <form method="POST" action="?/create" use:enhance class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="code-tag">Tag</Label>
        <Input id="code-tag" name="tag" required value={tagInput} oninput={onTagInput} autocomplete="off" spellcheck={false} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="code-code">Code</Label>
        <Input id="code-code" name="code" required bind:value={codeInput} autocomplete="off" spellcheck={false} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="code-label">Label (optional)</Label>
        <Input id="code-label" name="label" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="code-expires">Expires (optional)</Label>
        <Input id="code-expires" name="expiresAt" type="datetime-local" />
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
        <Button type="submit">Create</Button>
      </div>
    </form>
  {/snippet}
</Dialog>
