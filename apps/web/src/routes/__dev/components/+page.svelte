<script lang="ts">
  import Badge from '$lib/components/ui/badge.svelte';
  import Button from '$lib/components/ui/button.svelte';
  import Card from '$lib/components/ui/card.svelte';
  import Dialog from '$lib/components/ui/dialog.svelte';
  import DropdownMenu from '$lib/components/ui/dropdown-menu.svelte';
  import Input from '$lib/components/ui/input.svelte';
  import Label from '$lib/components/ui/label.svelte';
  import ScrollArea from '$lib/components/ui/scroll-area.svelte';
  import Separator from '$lib/components/ui/separator.svelte';
  import Table from '$lib/components/ui/table.svelte';
  import Tabs from '$lib/components/ui/tabs.svelte';
  import { toast } from '$lib/components/ui/toast.svelte';
  import Tooltip from '$lib/components/ui/tooltip.svelte';

  let dialogOpen = $state(false);
  let inputValue = $state('');
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-8 p-8">
  <header class="flex flex-col gap-1">
    <h1 class="text-3xl font-bold tracking-tight">Component playground</h1>
    <p class="text-sm text-[color:var(--color-muted-foreground)]">
      Dev-only smoke test for every vendored shadcn-svelte component.
    </p>
  </header>

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Button</h2>
    <div class="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
    </div>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Badge</h2>
    <div class="flex flex-wrap gap-2">
      <Badge>default</Badge>
      <Badge variant="secondary">secondary</Badge>
      <Badge variant="destructive">destructive</Badge>
      <Badge variant="outline">outline</Badge>
    </div>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Card</h2>
    <Card>
      {#snippet title()}Session cs101-lecture-03{/snippet}
      {#snippet description()}42 prompts · live · 7 viewers{/snippet}
      {#snippet content()}
        <p class="text-sm">Card body content.</p>
      {/snippet}
      {#snippet footer()}
        <Button size="sm">Open</Button>
      {/snippet}
    </Card>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Input + Label</h2>
    <div class="flex flex-col gap-2">
      <Label for="demo-input">Class code</Label>
      <Input id="demo-input" placeholder="cs101-fall26" bind:value={inputValue} />
      <p class="text-xs text-[color:var(--color-muted-foreground)]">Value: {inputValue}</p>
    </div>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Dialog</h2>
    <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
    <Dialog bind:open={dialogOpen}>
      {#snippet title()}Confirm{/snippet}
      {#snippet description()}This is a dialog body.{/snippet}
      {#snippet footer()}
        <Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
        <Button onclick={() => (dialogOpen = false)}>OK</Button>
      {/snippet}
    </Dialog>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">DropdownMenu</h2>
    <DropdownMenu>
      {#snippet trigger()}
        <Button variant="outline">Open menu</Button>
      {/snippet}
      <button type="button" class="block w-full rounded px-2 py-1.5 text-left hover:bg-[color:var(--color-accent)]">Profile</button>
      <button type="button" class="block w-full rounded px-2 py-1.5 text-left hover:bg-[color:var(--color-accent)]">Settings</button>
      <button type="button" class="block w-full rounded px-2 py-1.5 text-left hover:bg-[color:var(--color-accent)]">Logout</button>
    </DropdownMenu>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Toast</h2>
    <Button onclick={() => toast({ title: 'Saved', description: 'Changes persisted.' })}>
      Fire toast
    </Button>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Table</h2>
    <Table>
      <thead>
        <tr>
          <th class="px-2 py-1 text-left">#</th>
          <th class="px-2 py-1 text-left">Title</th>
          <th class="px-2 py-1 text-left">Count</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="px-2 py-1">1</td>
          <td class="px-2 py-1">cs101-lecture-03</td>
          <td class="px-2 py-1">42</td>
        </tr>
        <tr>
          <td class="px-2 py-1">2</td>
          <td class="px-2 py-1">cs101-lecture-04</td>
          <td class="px-2 py-1">31</td>
        </tr>
      </tbody>
    </Table>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Tabs</h2>
    <Tabs
      items={[
        { value: 'overview', label: 'Overview', content: overviewContent },
        { value: 'prompts', label: 'Prompts', content: promptsContent },
      ]}
    />
  </section>

  {#snippet overviewContent()}
    <p class="text-sm">Overview tab content.</p>
  {/snippet}
  {#snippet promptsContent()}
    <p class="text-sm">Prompts tab content.</p>
  {/snippet}

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">Tooltip</h2>
    <Tooltip label="This is a tooltip">
      <Button variant="outline">Hover me</Button>
    </Tooltip>
  </section>

  <Separator />

  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-semibold">ScrollArea</h2>
    <ScrollArea class="h-32 border border-[color:var(--color-border)] p-2">
      {#each Array.from({ length: 20 }) as _, i}
        <p class="py-1 text-sm">Line {i + 1}</p>
      {/each}
    </ScrollArea>
  </section>
</div>
