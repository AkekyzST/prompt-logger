<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { Moon, Sun, User as UserIcon, LogOut } from 'lucide-svelte';
  import Toast from '$lib/components/ui/toast.svelte';
  import Badge from '$lib/components/ui/badge.svelte';
  import DropdownMenu from '$lib/components/ui/dropdown-menu.svelte';
  import { toggleMode } from '$lib/theme/mode.svelte.js';
  import type { AppUser } from '../app.d.ts';

  type LayoutData = { user: AppUser | null; theme: 'light' | 'dark' | 'system' };

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<a
  href="#main"
  class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[color:var(--color-primary)] focus:px-3 focus:py-2 focus:text-[color:var(--color-primary-foreground)]"
>
  Skip to main content
</a>

<div data-slot="app-shell" class="min-h-screen bg-[color:var(--color-background)] text-[color:var(--color-foreground)]">
  <header
    data-slot="top-bar"
    class="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-background)]/90 backdrop-blur"
  >
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
      <a
        href="/"
        class="text-base font-semibold tracking-tight text-balance focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 rounded-md"
      >
        Prompt&nbsp;Logger
      </a>

      <div class="flex items-center gap-2">
        <button
          type="button"
          aria-label="Toggle dark mode"
          onclick={() => toggleMode()}
          class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-border)] bg-transparent text-[color:var(--color-foreground)] transition-[background-color,color] hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
        >
          <Sun class="h-4 w-4 dark:hidden" aria-hidden="true" />
          <Moon class="hidden h-4 w-4 dark:block" aria-hidden="true" />
        </button>

        {#if data.user}
          {@const currentUser = data.user}
          <DropdownMenu align="end">
            {#snippet trigger()}
              <span
                class="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-border)] px-3 text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
              >
                <UserIcon class="h-4 w-4" aria-hidden="true" />
                <span class="max-w-[12rem] truncate">{currentUser.email}</span>
              </span>
            {/snippet}
            {#snippet children()}
              <div class="px-2 py-1.5">
                <div class="truncate text-sm font-medium">{currentUser.email}</div>
                <div class="mt-1">
                  <Badge variant={currentUser.role === 'admin' ? 'default' : 'secondary'}>
                    {currentUser.role}
                  </Badge>
                </div>
              </div>
              <div class="my-1 h-px bg-[color:var(--color-border)]" role="separator"></div>
              <a
                href="/me"
                role="menuitem"
                class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
              >
                <UserIcon class="h-4 w-4" aria-hidden="true" />
                Profile
              </a>
              <form method="POST" action="/logout" class="contents">
                <button
                  type="submit"
                  role="menuitem"
                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[color:var(--color-accent)] hover:text-[color:var(--color-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)]"
                >
                  <LogOut class="h-4 w-4" aria-hidden="true" />
                  Logout
                </button>
              </form>
            {/snippet}
          </DropdownMenu>
        {/if}
      </div>
    </div>
  </header>

  <main
    id="main"
    class="mx-auto max-w-6xl px-4 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2"
    tabindex="-1"
  >
    {@render children()}
  </main>
</div>

<Toast />
