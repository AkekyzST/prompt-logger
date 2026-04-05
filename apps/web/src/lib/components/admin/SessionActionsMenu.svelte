<script lang="ts">
  /**
   * Dropdown quick-action menu for admin session rows on the dashboard.
   * Each action is a plain link to the single-session editor — the editor
   * hosts the full form actions. Keeping the menu nav-only means the menu
   * works without JS (middle-click, Cmd+click, keyboard Enter all apply).
   */
  import { MoreHorizontal, Pencil, Share2, Send, Trash2 } from 'lucide-svelte';
  import DropdownMenu from '$lib/components/ui/dropdown-menu.svelte';
  import type { Session } from '$lib/api/types.js';

  type Props = { session: Session };
  let { session }: Props = $props();

  const editHref = $derived(`/admin/sessions/${session.id}`);
</script>

<DropdownMenu align="end">
  {#snippet trigger()}
    <span
      class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
      aria-label={`Actions for ${session.title}`}
    >
      <MoreHorizontal class="h-4 w-4" aria-hidden="true" />
    </span>
  {/snippet}
  {#snippet children()}
    <a
      href={`${editHref}#visibility`}
      role="menuitem"
      class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
    >
      <Send class="h-4 w-4" aria-hidden="true" />
      Publish to class
    </a>
    <a
      href={`${editHref}#grants`}
      role="menuitem"
      class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
    >
      <Share2 class="h-4 w-4" aria-hidden="true" />
      Share with…
    </a>
    <a
      href={`${editHref}#rename`}
      role="menuitem"
      class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
    >
      <Pencil class="h-4 w-4" aria-hidden="true" />
      Rename
    </a>
    <div class="my-1 h-px bg-[color:var(--color-border)]" role="separator"></div>
    <a
      href={`${editHref}#danger`}
      role="menuitem"
      class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[color:var(--color-destructive)] hover:bg-[color:var(--color-destructive)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
    >
      <Trash2 class="h-4 w-4" aria-hidden="true" />
      Delete
    </a>
  {/snippet}
</DropdownMenu>
