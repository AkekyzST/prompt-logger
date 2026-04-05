<script lang="ts">
  /**
   * Session grants panel. Renders the current ACL list and an add-by-email
   * form. Both sides are SvelteKit form actions so the panel works without
   * JS (progressive enhancement is mandatory per the phase 4 quality gates).
   */
  import { enhance } from '$app/forms';
  import { Trash2 } from 'lucide-svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';

  type Grant = { userId: string; email: string | null; displayName: string | null };

  type Props = { grants: Grant[] };
  let { grants }: Props = $props();
</script>

<section id="grants" aria-labelledby="grants-heading" class="flex flex-col gap-3">
  <h2 id="grants-heading" class="text-sm font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
    Grants
  </h2>

  {#if grants.length > 0}
    <ul class="flex flex-col gap-1.5">
      {#each grants as grant (grant.userId)}
        <li
          class="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{grant.email ?? grant.userId}</p>
            {#if grant.displayName}
              <p class="truncate text-xs text-[color:var(--color-muted-foreground)]">{grant.displayName}</p>
            {/if}
          </div>
          <form method="POST" action="?/removeGrant" use:enhance>
            <input type="hidden" name="userId" value={grant.userId} />
            <Button type="submit" variant="ghost" size="sm" aria-label={`Remove grant for ${grant.email ?? grant.userId}`}>
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              Remove
            </Button>
          </form>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      No individual grants. Share via a class code or change visibility to shared.
    </p>
  {/if}

  <form method="POST" action="?/addGrant" use:enhance class="flex flex-wrap items-end gap-2">
    <div class="flex min-w-[16rem] flex-1 flex-col gap-1.5">
      <Label for="grant-email">Add viewer by email</Label>
      <Input id="grant-email" name="email" type="email" required autocomplete="off" spellcheck={false} placeholder="student@example.edu" />
    </div>
    <Button type="submit">Add grant</Button>
  </form>
</section>
