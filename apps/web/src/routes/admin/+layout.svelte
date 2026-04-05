<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import { LayoutDashboard, ListOrdered, Users, KeyRound, ScrollText } from 'lucide-svelte';
  import type { AppUser } from '../../app.d.ts';

  type LayoutData = { user: AppUser };
  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Sub-nav items rendered as real anchors so Cmd/Ctrl+click and middle-click
  // open in new tabs, and keyboard nav works out of the box.
  const NAV_ITEMS = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/sessions', label: 'Sessions', icon: ListOrdered },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/codes', label: 'Class codes', icon: KeyRound },
    { href: '/admin/audit', label: 'Audit', icon: ScrollText },
  ] as const;

  // Exact match for `/admin`, prefix match for everything else.
  function isActive(pathname: string, href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<div data-slot="admin-shell" class="flex flex-col gap-6 lg:flex-row lg:items-start">
  <aside
    data-slot="admin-nav"
    class="lg:sticky lg:top-20 lg:w-56 lg:shrink-0"
    aria-label="Admin navigation"
  >
    <nav
      class="flex flex-row gap-1 overflow-x-auto border-b border-[color:var(--color-border)] pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-none lg:pb-0"
    >
      {#each NAV_ITEMS as item (item.href)}
        {@const active = isActive($page.url.pathname, item.href)}
        <a
          href={item.href}
          aria-current={active ? 'page' : undefined}
          class="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[color:var(--color-muted-foreground)] transition-[color,background-color] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 aria-[current=page]:bg-[color:var(--color-accent)] aria-[current=page]:text-[color:var(--color-foreground)]"
        >
          <item.icon class="h-4 w-4" aria-hidden="true" />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>
    <p class="mt-4 hidden text-xs text-[color:var(--color-muted-foreground)] lg:block">
      Signed in as <span class="font-medium text-[color:var(--color-foreground)]">{data.user.email}</span>
    </p>
  </aside>

  <div data-slot="admin-content" class="min-w-0 flex-1">
    {@render children()}
  </div>
</div>
