<script lang="ts">
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/card.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import Dialog from '$lib/components/ui/dialog.svelte';
  import Tooltip from '$lib/components/ui/tooltip.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { User } from '$lib/api/types.js';
  import type { ActionData } from './$types.js';

  type PageData = { users: User[]; nextCursor: string | null; currentUserId: string | null };
  let { data, form }: { data: PageData; form: ActionData } = $props();

  let inviteOpen = $state(false);
</script>

<svelte:head>
  <title>Users · Admin · Prompt Logger</title>
</svelte:head>

<section class="flex flex-col gap-5">
  <header class="flex items-center justify-between gap-3">
    <div class="flex flex-col gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight text-balance">Users</h1>
      <p class="text-sm text-[color:var(--color-muted-foreground)]">
        Manage roles and invite new members.
      </p>
    </div>
    <Button onclick={() => (inviteOpen = true)}>Invite by email</Button>
  </header>

  {#if form && 'error' in form && form.error}
    <p role="alert" aria-live="polite" class="text-xs text-[color:var(--color-destructive)]">{form.error}</p>
  {/if}
  {#if form && 'invited' in form && form.invited}
    <p role="status" aria-live="polite" class="text-xs text-[color:var(--color-muted-foreground)]">
      Invited {form.invited}.
    </p>
  {/if}

  <div class="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
    <div class="w-full overflow-auto">
      <table class="w-full caption-bottom text-sm tabular-nums">
        <caption class="sr-only">Admin users list with role and removal actions</caption>
        <thead class="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          <tr>
            <th scope="col" class="px-3 py-2 font-medium">Email</th>
            <th scope="col" class="px-3 py-2 font-medium">Display name</th>
            <th scope="col" class="px-3 py-2 font-medium">Role</th>
            <th scope="col" class="px-3 py-2 font-medium">Last login</th>
            <th scope="col" class="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.users as u (u.id)}
            {@const isSelf = u.id === data.currentUserId}
            <tr class="border-b border-[color:var(--color-border)] last:border-0">
              <td class="px-3 py-2 font-medium">{u.email}</td>
              <td class="px-3 py-2 text-[color:var(--color-muted-foreground)]">{u.displayName ?? '—'}</td>
              <td class="px-3 py-2"><Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge></td>
              <td class="px-3 py-2">
                {#if u.lastLoginAt}<Time iso={u.lastLoginAt} class="text-xs" />{:else}<span class="text-xs text-[color:var(--color-muted-foreground)]">never</span>{/if}
              </td>
              <td class="px-3 py-2">
                <div class="flex justify-end gap-2">
                  {#if u.role === 'viewer'}
                    <form method="POST" action="?/promote" use:enhance>
                      <input type="hidden" name="id" value={u.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={isSelf} aria-disabled={isSelf}>
                        Promote
                      </Button>
                    </form>
                  {:else}
                    {#if isSelf}
                      <Tooltip label="Cannot modify your own account">
                        <Button type="button" variant="outline" size="sm" disabled aria-disabled="true">Demote</Button>
                      </Tooltip>
                    {:else}
                      <form method="POST" action="?/demote" use:enhance>
                        <input type="hidden" name="id" value={u.id} />
                        <Button type="submit" variant="outline" size="sm">Demote</Button>
                      </form>
                    {/if}
                  {/if}
                  {#if isSelf}
                    <Tooltip label="Cannot modify your own account">
                      <Button type="button" variant="destructive" size="sm" disabled aria-disabled="true">Remove</Button>
                    </Tooltip>
                  {:else}
                    <form method="POST" action="?/remove" use:enhance>
                      <input type="hidden" name="id" value={u.id} />
                      <Button type="submit" variant="destructive" size="sm">Remove</Button>
                    </form>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-3 py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                No users yet.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</section>

<Dialog bind:open={inviteOpen} onOpenChange={(v) => (inviteOpen = v)}>
  {#snippet title()}Invite a user{/snippet}
  {#snippet description()}Creates a stub row; on first OIDC login the user is hydrated automatically.{/snippet}
  {#snippet children()}
    <form method="POST" action="?/invite" use:enhance class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required autocomplete="off" spellcheck={false} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-name">Display name (optional)</Label>
        <Input id="invite-name" name="displayName" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          class="flex h-9 w-full rounded-md border border-[color:var(--color-input)] bg-[color:var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
        >
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" onclick={() => (inviteOpen = false)}>Cancel</Button>
        <Button type="submit">Send invite</Button>
      </div>
    </form>
  {/snippet}
</Dialog>
