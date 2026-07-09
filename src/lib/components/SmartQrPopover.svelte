<script lang="ts">
  import { onMount } from "svelte";

  const {
    open = false,
    loading = false,
    imageSrc = "",
    error = "",
    onclose,
  }: {
    open?: boolean;
    loading?: boolean;
    imageSrc?: string;
    error?: string;
    onclose?: () => void;
  } = $props();

  let root = $state<HTMLDivElement | null>(null);

  function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    onclose?.();
  }

  function handleDocumentPointerDown(e: PointerEvent) {
    if (!open || !root) return;
    if (!root.contains(e.target as Node)) onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose?.();
    }
  }

  onMount(() => {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="smart-qr-popover" bind:this={root} role="dialog" aria-label="QR code">
    {#if loading}
      <div class="smart-qr-state">Generating QR code…</div>
    {:else if error}
      <div class="smart-qr-state smart-qr-state--error">{error}</div>
    {:else if imageSrc}
      <img class="smart-qr-image" src={imageSrc} alt="QR code for link" />
    {/if}
    <button class="popover-menu-item app-btn smart-qr-dismiss" type="button" onclick={handleDismiss}>
      Dismiss
    </button>
  </div>
{/if}

<style>
  .smart-qr-popover {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 95;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--surface-menu);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    box-shadow: var(--shadow-elevated);
    transform: translate(-50%, -50%);
  }

  .smart-qr-image {
    width: 9rem;
    height: 9rem;
    display: block;
    image-rendering: pixelated;
    border-radius: var(--radius-control-sm);
    background: var(--surface-1);
  }

  .smart-qr-state {
    width: 9rem;
    min-height: 9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
  }

  .smart-qr-state--error {
    color: var(--color-danger-text);
  }

  .smart-qr-dismiss {
    width: 100%;
    justify-content: center;
  }
</style>
