<script lang="ts">
  import { dev } from '$app/environment';
  import { Moon, Sun } from 'lucide-svelte';
  import Button from '$lib/components/ui/button.svelte';
  import { toggleMode } from '$lib/theme/mode.svelte';
</script>

<svelte:head>
  <title>Prompt Logger</title>
  <meta name="description" content="Self-hosted real-time viewer for Claude Code prompts." />
</svelte:head>

<section class="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 p-8">
  <h1 class="text-4xl font-bold tracking-tight">Prompt Logger</h1>
  <p class="text-[color:var(--color-muted-foreground)]">
    Self-hosted real-time viewer for Claude Code prompts. The full UI ships in subsequent phases —
    this page confirms the design system is wired up.
  </p>
  <div class="flex items-center gap-3">
    <Button onclick={toggleMode} aria-label="Toggle dark mode">
      <Sun class="h-4 w-4 dark:hidden" aria-hidden="true" />
      <Moon class="hidden h-4 w-4 dark:block" aria-hidden="true" />
      Toggle theme
    </Button>
    {#if dev}
      <Button href="/__dev/components" variant="outline">Component playground</Button>
    {/if}
  </div>
</section>
