<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { X, ChevronDown, ChevronUp } from 'lucide-svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    onConfirm: (endEntryIndex: number) => void;
    onClose: () => void;
  }

  let { onConfirm, onClose }: Props = $props();

  // Get entries available for chapter creation
  // These are entries after the last chapter
  const availableEntries = $derived(() => {
    const lastChapterEndIndex = story.lastChapterEndIndex;
    return story.entries.slice(lastChapterEndIndex);
  });

  const entries = $derived(availableEntries());

  // Selected entry index (relative to available entries)
  let selectedIndex = $state(Math.max(0, entries.length - 1));

  // Ensure selectedIndex stays in bounds
  $effect(() => {
    if (selectedIndex >= entries.length) {
      selectedIndex = Math.max(0, entries.length - 1);
    }
  });

  function truncate(text: string, maxLength: number = 80): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }

  function handleConfirm() {
    if (entries.length === 0) return;
    // Convert to absolute index
    const absoluteIndex = story.lastChapterEndIndex + selectedIndex + 1;
    onConfirm(absoluteIndex);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/60 z-50"
  transition:fade={{ duration: 150 }}
  onclick={onClose}
  role="button"
  tabindex="-1"
></div>

<!-- Modal -->
<div
  class="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-lg mx-auto"
  transition:fly={{ y: 20, duration: 200 }}
>
  <div class="bg-surface-800 rounded-xl shadow-xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-surface-700">
      <h2 class="text-lg font-semibold text-surface-100">Create Chapter</h2>
      <button
        class="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200"
        onclick={onClose}
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-4">
      {#if entries.length === 0}
        <p class="text-surface-400 text-center py-4">
          No entries available for chapter creation.
        </p>
      {:else}
        <p class="text-sm text-surface-300">
          Select where to end this chapter. All entries up to and including the selected entry
          will be summarized.
        </p>

        <!-- Entry Selector -->
        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each entries as entry, idx}
            <button
              class="w-full text-left p-2 rounded transition-colors"
              class:bg-primary-600={selectedIndex === idx}
              class:bg-surface-700={selectedIndex !== idx}
              class:hover:bg-surface-600={selectedIndex !== idx}
              onclick={() => selectedIndex = idx}
            >
              <div class="flex items-start gap-2">
                <span
                  class="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded {entry.type === 'user_action' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'}"
                >
                  {entry.type === 'user_action' ? 'ACTION' : 'NARRATIVE'}
                </span>
                <span class="text-xs text-surface-300 leading-relaxed">
                  {truncate(entry.content)}
                </span>
              </div>
            </button>
          {/each}
        </div>

        <div class="text-xs text-surface-500">
          Chapter will include {selectedIndex + 1} of {entries.length} entries
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 p-4 border-t border-surface-700">
      <button
        class="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
        onclick={onClose}
      >
        Cancel
      </button>
      <button
        class="btn-primary px-4 py-2 text-sm font-medium rounded-lg"
        onclick={handleConfirm}
        disabled={entries.length === 0 || ui.memoryLoading}
      >
        {#if ui.memoryLoading}
          Creating...
        {:else}
          Create Chapter
        {/if}
      </button>
    </div>
  </div>
</div>
