<script lang="ts">
  /**
   * Session visibility indicator. Uses a Lucide icon + badge colour per
   * variant. Exposes a single `visibility` prop and a single root `className`
   * per the styling rules in CLAUDE.md (no internal `*ClassName` props).
   */
  import { Lock, Users, KeyRound } from 'lucide-svelte';
  import type { SessionVisibility } from '$lib/api/types.js';
  import { cn } from '$lib/utils';

  type Props = { visibility: SessionVisibility; class?: string };
  let { visibility, class: className }: Props = $props();

  const META: Record<
    SessionVisibility,
    {
      label: string;
      // biome-ignore lint/suspicious/noExplicitAny: Lucide component type is structural
      icon: any;
      tone: string;
    }
  > = {
    private: {
      label: 'Private',
      icon: Lock,
      tone: 'border-neutral-400/50 bg-neutral-400/10 text-neutral-700 dark:text-neutral-300',
    },
    shared: {
      label: 'Shared',
      icon: Users,
      tone: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    code: {
      label: 'Class code',
      icon: KeyRound,
      tone: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    },
  };
</script>

<span
  data-slot="visibility-badge"
  data-visibility={visibility}
  class={cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
    META[visibility].tone,
    className
  )}
>
  {#if visibility === 'private'}
    <Lock class="h-3 w-3" aria-hidden="true" />
  {:else if visibility === 'shared'}
    <Users class="h-3 w-3" aria-hidden="true" />
  {:else}
    <KeyRound class="h-3 w-3" aria-hidden="true" />
  {/if}
  <span>{META[visibility].label}</span>
</span>
