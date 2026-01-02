<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { X, RefreshCw, AlertTriangle } from 'lucide-svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    chapterId: string | null;
    onConfirm: () => void;
    onClose: () => void;
  }

  let { chapterId, onConfirm, onClose }: Props = $props();

  const chapter = $derived(
    chapterId ? story.chapters.find(c => c.id === chapterId) : null
  );

  // Get previous chapters (for context display)
  const previousChapters = $derived(
    chapter
      ? story.chapters
          .filter(c => c.number < chapter.number)
          .sort((a, b) => a.number - b.number)
      : []
  );

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !ui.memoryLoading) {
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/60 z-50"
  transition:fade={{ duration: 150 }}
  onclick={() => !ui.memoryLoading && onClose()}
  onkeydown={(e) => e.key === 'Enter' && !ui.memoryLoading && onClose()}
  role="button"
  tabindex="-1"
></div>

<!-- Modal -->
<div
  class="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto"
  transition:fly={{ y: 20, duration: 200 }}
>
  <div class="bg-surface-800 rounded-xl shadow-xl overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-surface-700">
      <div class="flex items-center gap-2">
        <RefreshCw class="h-5 w-5 text-primary-400" />
        <h2 class="text-lg font-semibold text-surface-100">Resummarize Chapter</h2>
      </div>
      {#if !ui.memoryLoading}
        <button
          class="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200"
          onclick={onClose}
        >
          <X class="h-5 w-5" />
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="p-4 space-y-4">
      {#if chapter}
        <div class="p-3 rounded-lg bg-surface-900">
          <div class="text-sm font-medium text-surface-200">
            Chapter {chapter.number}{chapter.title ? `: ${chapter.title}` : ''}
          </div>
          <p class="text-xs text-surface-400 mt-1 line-clamp-2">
            {chapter.summary}
          </p>
        </div>

        {#if previousChapters.length > 0}
          <div class="space-y-2">
            <p class="text-sm text-surface-300">
              The following {previousChapters.length} chapter{previousChapters.length === 1 ? '' : 's'} will be used as context:
            </p>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              {#each previousChapters as prevChapter}
                <div class="text-xs text-surface-500 p-2 rounded bg-surface-900/50">
                  <span class="font-medium text-surface-400">Ch {prevChapter.number}</span>
                  {#if prevChapter.title}
                    <span>: {prevChapter.title}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="flex items-start gap-2 p-3 rounded-lg bg-yellow-900/20 border border-yellow-800/30">
            <AlertTriangle class="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <p class="text-xs text-yellow-400">
              This is the first chapter, so no previous context will be used.
            </p>
          </div>
        {/if}

        <p class="text-sm text-surface-400">
          The current summary will be replaced with a newly generated one.
          The chapter's old summary will <strong>not</strong> be included in the prompt.
        </p>
      {:else}
        <p class="text-surface-400 text-center py-4">
          Chapter not found.
        </p>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 p-4 border-t border-surface-700">
      {#if !ui.memoryLoading}
        <button
          class="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
          onclick={onClose}
        >
          Cancel
        </button>
      {/if}
      <button
        class="btn-primary px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2"
        onclick={onConfirm}
        disabled={!chapter || ui.memoryLoading}
      >
        {#if ui.memoryLoading}
          <RefreshCw class="h-4 w-4 animate-spin" />
          <span>Generating...</span>
        {:else}
          <RefreshCw class="h-4 w-4" />
          <span>Resummarize</span>
        {/if}
      </button>
    </div>
  </div>
</div>
