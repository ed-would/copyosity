<script lang="ts">
  import type { SmartKind } from "$lib/smart-actions";

  const {
    contentType,
    formatLabel = null,
    labelOverride = null,
    colorHex = null,
    smartKind = null,
    interactive = false,
    class: className = "",
  }: {
    contentType: string;
    /** Image format chip (PNG, GIF, …) when known; otherwise generic type label. */
    formatLabel?: string | null;
    /** Smart-action or other override for the visible type label. */
    labelOverride?: string | null;
    /** Optional color swatch shown before the label (smart color actions). */
    colorHex?: string | null;
    /** When set, badge uses a kind-specific icon instead of the generic text glyph. */
    smartKind?: SmartKind | null;
    /** True when the badge itself is the primary smart-action control. */
    interactive?: boolean;
    class?: string;
  } = $props();

  const iconKind = $derived(
    smartKind
      ? "smart"
      : contentType === "image"
        ? "image"
        : contentType === "text"
          ? "text"
          : "file",
  );

  const label = $derived(
    labelOverride ??
      (contentType === "image" && formatLabel
        ? formatLabel
        : contentType === "text"
          ? "Text"
          : contentType === "image"
            ? "Image"
            : "File"),
  );

  const isFormatLabel = $derived(contentType === "image" && !!formatLabel && !labelOverride);
</script>

<span
  class="card-type-badge {className}"
  class:card-type-badge--smart={!!smartKind}
  class:card-type-badge--interactive={interactive}
  class:card-type-badge--color={smartKind === "color"}
>
  {#if colorHex}
    <span class="card-type-badge-swatch" style={`background:${colorHex}`} aria-hidden="true"></span>
  {:else}
    <svg
      class="card-type-badge-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={iconKind === "image" || smartKind ? "2" : "1.75"}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {#if smartKind === "link"}
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      {:else if smartKind === "email"}
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      {:else if smartKind === "phone"}
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        />
      {:else if smartKind === "address"}
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      {:else if smartKind === "math"}
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      {:else if smartKind === "json"}
        <path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3c0 1.1.9 2 2 2h2" />
        <path d="M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" />
      {:else if iconKind === "text"}
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      {:else if iconKind === "image"}
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      {:else}
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      {/if}
    </svg>
  {/if}
  <span class="card-type-badge-label" class:card-type-badge-label--format={isFormatLabel}>
    {label}
  </span>
  {#if interactive}
    <svg
      class="card-type-badge-affordance"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  {/if}
</span>

<style>
  .card-type-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--card-type-gap);
    box-sizing: border-box;
    min-height: var(--size-card-action-hit);
    width: fit-content;
    padding: var(--card-type-pad);
    border-radius: var(--radius-pill);
    background: var(--surface-7);
    font-weight: 600;
    font-size: var(--font-size-sm);
    line-height: 1;
    letter-spacing: 0.02em;
    color: var(--color-text-secondary);
  }

  .card-type-badge--smart {
    color: var(--color-text-body);
    background: var(--surface-10);
  }

  .card-type-badge--interactive {
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-interactive),
      color var(--duration-fast) var(--ease-interactive),
      box-shadow var(--duration-fast) var(--ease-interactive);
  }

  .card-type-badge--interactive:hover {
    background: var(--surface-accent-muted);
    color: var(--color-accent-text);
  }

  .card-type-badge-swatch {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-strong);
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%);
  }

  .card-type-badge-icon {
    width: var(--icon-size-card-type);
    height: var(--icon-size-card-type);
    flex-shrink: 0;
    opacity: 0.92;
  }

  .card-type-badge-affordance {
    width: 0.7rem;
    height: 0.7rem;
    flex-shrink: 0;
    opacity: 0.55;
    margin-left: -0.1rem;
  }

  .card-type-badge--interactive:hover .card-type-badge-affordance {
    opacity: 0.9;
  }

  .card-type-badge-label {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .card-type-badge-label--format {
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
