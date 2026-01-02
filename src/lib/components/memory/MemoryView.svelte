<script lang="ts">
  import type { Chapter } from '$lib/types';
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { aiService } from '$lib/services/ai';
  import MemoryHeader from './MemoryHeader.svelte';
  import MemorySettings from './MemorySettings.svelte';
  import ChapterCard from './ChapterCard.svelte';
  import ManualChapterModal from './ManualChapterModal.svelte';
  import ResummarizeModal from './ResummarizeModal.svelte';
  import { BookOpen } from 'lucide-svelte';

  // Get chapters sorted by number (descending - newest first)
  const sortedChapters = $derived(
    [...story.chapters].sort((a, b) => b.number - a.number)
  );

  // Get entries for each chapter
  function getChapterEntries(chapter: Chapter) {
    return story.getChapterEntries(chapter);
  }

  // Handle manual chapter creation
  async function handleCreateManualChapter(endEntryIndex: number) {
    ui.setMemoryLoading(true);
    try {
      await story.createManualChapter(endEntryIndex);
      ui.closeManualChapterModal();
    } finally {
      ui.setMemoryLoading(false);
    }
  }

  // Handle resummarization
  async function handleResummarize(chapter: Chapter) {
    ui.openResummarizeModal(chapter.id);
  }

  async function confirmResummarize() {
    const chapterId = ui.resummarizeChapterId;
    if (!chapterId) return;

    const chapter = story.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    ui.setMemoryLoading(true);
    try {
      const entries = getChapterEntries(chapter);
      const newSummary = await aiService.resummarizeChapter(chapter, entries, story.chapters);

      // Update the chapter with new summary and metadata
      await story.updateChapter(chapter.id, {
        summary: newSummary.summary,
        title: newSummary.title,
        keywords: newSummary.keywords,
        characters: newSummary.characters,
        locations: newSummary.locations,
        plotThreads: newSummary.plotThreads,
        emotionalTone: newSummary.emotionalTone,
      });

      ui.closeResummarizeModal();
    } catch (error) {
      console.error('Failed to resummarize chapter:', error);
    } finally {
      ui.setMemoryLoading(false);
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 space-y-4">
    <!-- Header with context usage -->
    <MemoryHeader />

    <!-- Collapsible Settings -->
    <MemorySettings />

    <!-- Chapter List -->
    {#if sortedChapters.length > 0}
      <div class="space-y-3">
        {#each sortedChapters as chapter (chapter.id)}
          <ChapterCard
            {chapter}
            entries={getChapterEntries(chapter)}
            onResummarize={handleResummarize}
          />
        {/each}
      </div>
    {:else}
      <!-- Empty State -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="p-4 rounded-full bg-surface-800 mb-4">
          <BookOpen class="h-8 w-8 text-surface-500" />
        </div>
        <h3 class="text-lg font-medium text-surface-200 mb-2">No Chapters Yet</h3>
        <p class="text-sm text-surface-400 max-w-sm">
          Chapters are created automatically when the story grows beyond the token threshold,
          or you can create one manually using the button above.
        </p>
      </div>
    {/if}
  </div>

  <!-- Modals -->
  {#if ui.manualChapterModalOpen}
    <ManualChapterModal
      onConfirm={handleCreateManualChapter}
      onClose={() => ui.closeManualChapterModal()}
    />
  {/if}

  {#if ui.resummarizeModalOpen}
    <ResummarizeModal
      chapterId={ui.resummarizeChapterId}
      onConfirm={confirmResummarize}
      onClose={() => ui.closeResummarizeModal()}
    />
  {/if}
</div>
