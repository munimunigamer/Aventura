<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { slide } from 'svelte/transition';

  const threshold = $derived(story.memoryConfig.tokenThreshold);
  const bufferMessages = $derived(story.memoryConfig.chapterBuffer);

  // Local state for editing
  let localThreshold = $state(threshold);
  let localBuffer = $state(bufferMessages);

  // Sync local state when props change
  $effect(() => {
    localThreshold = threshold;
  });

  $effect(() => {
    localBuffer = bufferMessages;
  });

  // Debounced save
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function scheduleThresholdSave(value: number) {
    localThreshold = value;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      story.updateMemoryConfig({ tokenThreshold: value });
    }, 500);
  }

  function scheduleBufferSave(value: number) {
    localBuffer = value;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      story.updateMemoryConfig({ chapterBuffer: value });
    }, 500);
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Threshold presets
  const thresholdPresets = [
    { label: '8K', value: 8000 },
    { label: '16K', value: 16000 },
    { label: '24K', value: 24000 },
    { label: '32K', value: 32000 },
    { label: '48K', value: 48000 },
  ];
</script>

{#if ui.memorySettingsOpen}
  <div class="rounded-lg bg-surface-800 p-4 space-y-4" transition:slide={{ duration: 200 }}>
    <h3 class="text-sm font-medium text-surface-200">Memory Settings</h3>

    <!-- Token Threshold -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label for="token-threshold" class="text-sm text-surface-300">Token Threshold</label>
        <span class="text-sm font-medium text-surface-200">{formatNumber(localThreshold)}</span>
      </div>
      <input
        id="token-threshold"
        type="range"
        min="4000"
        max="100000"
        step="1000"
        value={localThreshold}
        oninput={(e) => scheduleThresholdSave(parseInt(e.currentTarget.value))}
        class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-surface-700 accent-primary-500"
      />
      <div class="flex items-center gap-1 flex-wrap">
        {#each thresholdPresets as preset}
          <button
            class="px-2 py-1 text-xs rounded transition-colors"
            class:bg-primary-600={localThreshold === preset.value}
            class:text-white={localThreshold === preset.value}
            class:bg-surface-700={localThreshold !== preset.value}
            class:text-surface-300={localThreshold !== preset.value}
            class:hover:bg-surface-600={localThreshold !== preset.value}
            onclick={() => scheduleThresholdSave(preset.value)}
          >
            {preset.label}
          </button>
        {/each}
      </div>
      <p class="text-xs text-surface-500">
        Auto-summarization triggers when token count exceeds this threshold.
      </p>
    </div>

    <!-- Buffer Messages -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label for="buffer-messages" class="text-sm text-surface-300">Buffer Messages</label>
        <span class="text-sm font-medium text-surface-200">{localBuffer}</span>
      </div>
      <input
        id="buffer-messages"
        type="range"
        min="0"
        max="50"
        step="1"
        value={localBuffer}
        oninput={(e) => scheduleBufferSave(parseInt(e.currentTarget.value))}
        class="w-full h-2 rounded-lg appearance-none cursor-pointer bg-surface-700 accent-primary-500"
      />
      <p class="text-xs text-surface-500">
        Recent messages protected from being included in chapter summaries.
        Higher values keep more context visible but create smaller chapters.
      </p>
    </div>
  </div>
{/if}
