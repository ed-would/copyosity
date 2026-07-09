<script lang="ts">
  import { onMount } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import type { ClipboardEntry } from "$lib/types";
  import { copyEntry, copyText, activateEntry, deleteEntry, pinEntry, retagEntry, generateQrCode, pasteEntry } from "$lib/api";
  import { prepareBusyUi } from "$lib/run-with-busy-ui";
  import {
    cardTagFooterTruncateFlags,
    cardTagTitle,
    formatCardTagLabel,
  } from "$lib/card-tag-label";
  import { cardDisplayTags } from "$lib/overlay-filters";
  import {
    imageDataUrl,
    imageOcrPreviewText,
    resolveImageFooterMetaParts,
    resolveImageFormatBadge,
  } from "$lib/image-meta";
  import CardTypeBadge from "$lib/components/CardTypeBadge.svelte";
  import SmartQrPopover from "$lib/components/SmartQrPopover.svelte";
  import { detectTextKind, usesMonoPreview } from "$lib/text-kind";
  import {
    notifyCardContextMenuClosed,
    notifyCardContextMenuOpened,
    OVERLAY_CLOSE_CARD_CONTEXT_MENUS,
  } from "$lib/overlay-card-context-menu";
  import {
    phoneDialUrl,
    resolveSmartAction,
    SMART_KIND_LABEL,
    smartContextMenuItems,
    smartPrimaryActionLabel,
    type SmartActionInfo,
  } from "$lib/smart-actions";

  const {
    entry,
    selected = false,
    ondeleted,
    onpinned,
    onretagged,
    onselect,
    onpreview,
    retagAvailable = false,
    aiTaggingEnabled = false,
    compactVertical = false,
  }: {
    entry: ClipboardEntry;
    selected?: boolean;
    ondeleted?: () => void;
    onpinned?: () => void;
    onretagged?: (tags: string[]) => void;
    onselect?: () => void;
    onpreview?: () => void;
    retagAvailable?: boolean;
    aiTaggingEnabled?: boolean;
    compactVertical?: boolean;
  } = $props();

  /** Collapse blank lines so line-clamp counts real content rows in compact vertical cards. */
  function compactPreviewText(text: string | null): string {
    if (!text) return "";
    return text.replace(/\n{2,}/g, "\n");
  }

  function formatCardDate(dateStr: string): string {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }

  function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return formatCardDate(dateStr);
  }

  let copied = $state(false);
  let pasting = $state(false);
  /** Measured natural width of the type pill, in px. Lets the collapse clip-path use a
   * pure-px calc() instead of mixing % with px, which keeps the transition on the
   * compositor thread (no per-frame layout query) and avoids WebKit stutter. */
  let typeWrapWidth = $state(0);
  let qrOpen = $state(false);
  let qrLoading = $state(false);
  let qrImageSrc = $state("");
  let qrError = $state("");
  let copyAnnouncement = $state("");
  let clickTimer: ReturnType<typeof setTimeout> | undefined;
  let copiedResetTimer: ReturnType<typeof setTimeout> | undefined;
  let copyAnnouncementTimer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;

  const COPY_FEEDBACK_MS = 800;

  onMount(() => {
    mounted = true;
    return () => {
      mounted = false;
      if (clickTimer !== undefined) {
        clearTimeout(clickTimer);
        clickTimer = undefined;
      }
      if (copiedResetTimer !== undefined) {
        clearTimeout(copiedResetTimer);
        copiedResetTimer = undefined;
      }
      if (copyAnnouncementTimer !== undefined) {
        clearTimeout(copyAnnouncementTimer);
        copyAnnouncementTimer = undefined;
      }
    };
  });

  $effect(() => {
    if (!contextMenuOpen) return;

    const armTimer = window.setTimeout(() => {
      contextMenuDismissArmed = true;
    }, 0);

    const onPointerDown = (e: PointerEvent) => {
      if (!contextMenuDismissArmed) return;
      const target = e.target;
      if (target instanceof Node && contextMenuEl?.contains(target)) return;
      closeContextMenu();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  });

  $effect(() => {
    const onCloseAll = () => closeContextMenu();
    window.addEventListener(OVERLAY_CLOSE_CARD_CONTEXT_MENUS, onCloseAll);
    return () => window.removeEventListener(OVERLAY_CLOSE_CARD_CONTEXT_MENUS, onCloseAll);
  });

  function clearCopyAnnouncementSoon() {
    if (copyAnnouncementTimer !== undefined) clearTimeout(copyAnnouncementTimer);
    copyAnnouncementTimer = setTimeout(() => {
      copyAnnouncementTimer = undefined;
      if (!mounted) return;
      copyAnnouncement = "";
    }, COPY_FEEDBACK_MS);
  }

  function clearCopyAnnouncement() {
    copyAnnouncement = "";
    if (copyAnnouncementTimer !== undefined) {
      clearTimeout(copyAnnouncementTimer);
      copyAnnouncementTimer = undefined;
    }
  }

  function announceCopy() {
    clearCopyAnnouncement();
    requestAnimationFrame(() => {
      if (!mounted) return;
      copyAnnouncement = "Copied to clipboard";
      clearCopyAnnouncementSoon();
    });
  }

  function announceCopyFailure() {
    clearCopyAnnouncement();
    requestAnimationFrame(() => {
      if (!mounted) return;
      copyAnnouncement = "Copy failed";
      clearCopyAnnouncementSoon();
    });
  }

  function announceOpenFailure() {
    clearCopyAnnouncement();
    requestAnimationFrame(() => {
      if (!mounted) return;
      copyAnnouncement = "Could not open";
      clearCopyAnnouncementSoon();
    });
  }

  function clearCopiedFeedback() {
    copied = false;
    if (copiedResetTimer !== undefined) {
      clearTimeout(copiedResetTimer);
      copiedResetTimer = undefined;
    }
  }

  /** Pointer-only: drop focus so selection ring does not stick after mouse action. */
  function releaseMouseActionFocus() {
    if (document.documentElement.dataset.inputModality === "keyboard") return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && cardEl?.contains(active)) {
        active.blur();
      }
      cardEl?.blur();
    });
  }

  function showCopiedFeedback() {
    if (!mounted) return;
    copied = true;
    announceCopy();
    if (copiedResetTimer !== undefined) clearTimeout(copiedResetTimer);
    copiedResetTimer = setTimeout(() => {
      copiedResetTimer = undefined;
      if (!mounted) return;
      copied = false;
    }, COPY_FEEDBACK_MS);
  }

  function cancelPendingCardClick() {
    if (clickTimer !== undefined) {
      clearTimeout(clickTimer);
      clickTimer = undefined;
    }
  }

  function activatePreview() {
    cancelPendingCardClick();
    onselect?.();
    onpreview?.();
  }

  function handlePreviewClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    activatePreview();
    releaseMouseActionFocus();
  }

  function openContextMenu(clientX: number, clientY: number) {
    if (!canPreview && !smartAction) return;
    onselect?.();
    closeQrPopover();
    contextMenuPos = { x: clientX, y: clientY };
    if (!contextMenuOpen) notifyCardContextMenuOpened();
    contextMenuOpen = true;
    contextMenuDismissArmed = false;
  }

  function closeContextMenu() {
    if (!contextMenuOpen) return;
    contextMenuOpen = false;
    contextMenuDismissArmed = false;
    notifyCardContextMenuClosed();
  }

  function handleCardContextMenu(e: MouseEvent) {
    if (!canPreview && !smartAction) return;
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY);
  }

  /** WKWebView/Tauri often skips `contextmenu`; secondary click still sends pointerdown. */
  function handleCardPointerDown(e: PointerEvent) {
    if (e.button !== 2 || (!canPreview && !smartAction)) return;
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY);
  }

  function handleContextMenuPreview() {
    closeContextMenu();
    activatePreview();
    releaseMouseActionFocus();
  }

  async function handleContextMenuSmart(id: string) {
    closeContextMenu();
    if (id === "smart-primary") {
      await handleSmartPrimary();
      return;
    }
    await handleSmartMenuSelect(id);
  }

  function handleClick() {
    clearCopyAnnouncement();
    onselect?.();
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = undefined;
      void handleDoubleClick();
      return;
    }
    clickTimer = setTimeout(() => {
      clickTimer = undefined;
      void handleSingleClick();
    }, 250);
  }

  async function handleSingleClick() {
    if (copied) return;
    if (entry.content_type === "text" || entry.content_type === "image") {
      try {
        await copyEntry(entry.id);
        if (!mounted) return;
        showCopiedFeedback();
      } catch {
        if (!mounted) return;
        clearCopiedFeedback();
        announceCopyFailure();
      }
    }
  }

  async function activateIntoTargetApp(options: { respectCopiedOverlay?: boolean } = {}) {
    const { respectCopiedOverlay = false } = options;
    if (pasting) return;
    if (respectCopiedOverlay && copied) return;
    if (entry.content_type !== "text" && entry.content_type !== "image") return;

    pasting = true;
    try {
      await prepareBusyUi();
      await activateEntry(entry.id);
    } finally {
      if (mounted) pasting = false;
    }
  }

  async function handleDoubleClick() {
    await activateIntoTargetApp({ respectCopiedOverlay: true });
  }

  async function handlePaste(e: MouseEvent) {
    e.stopPropagation();
    onselect?.();
    try {
      await activateIntoTargetApp();
    } finally {
      releaseMouseActionFocus();
    }
  }

  /** Copy the OCR-recognised text of an image to the clipboard. */
  async function handleCopyOcr(e: MouseEvent) {
    e.stopPropagation();
    const text = entry.ocr_text?.trim();
    if (!text) return;
    try {
      await copyText(text);
      if (!mounted) return;
      showCopiedFeedback();
    } catch {
      if (!mounted) return;
      announceCopyFailure();
    }
  }

  /** Space is reserved for Quick Look (handled at the overlay level); only Enter pastes here. */
  function handleCardKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void handleDoubleClick();
  }

  async function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    onselect?.();
    try {
      await deleteEntry(entry.id);
      ondeleted?.();
    } finally {
      releaseMouseActionFocus();
    }
  }

  async function handlePin(e: MouseEvent) {
    e.stopPropagation();
    onselect?.();
    try {
      await pinEntry(entry.id, !entry.is_pinned);
      onpinned?.();
    } finally {
      releaseMouseActionFocus();
    }
  }

  async function handleRetag(e: MouseEvent) {
    e.stopPropagation();
    onselect?.();
    try {
      const tags = await retagEntry(entry.id);
      onretagged?.(tags);
    } finally {
      releaseMouseActionFocus();
    }
  }

  function closeQrPopover() {
    qrOpen = false;
    qrLoading = false;
    qrImageSrc = "";
    qrError = "";
  }

  async function copySmartText(text: string, e?: MouseEvent) {
    e?.stopPropagation();
    onselect?.();
    try {
      await copyText(text);
      if (!mounted) return;
      showCopiedFeedback();
    } catch {
      if (!mounted) return;
      announceCopyFailure();
    } finally {
      releaseMouseActionFocus();
    }
  }

  async function pasteSmartText(text: string, e?: MouseEvent) {
    e?.stopPropagation();
    onselect?.();
    try {
      await prepareBusyUi();
      await pasteEntry(text);
    } finally {
      releaseMouseActionFocus();
    }
  }

  async function openSmartUrl(url: string, e?: MouseEvent) {
    e?.stopPropagation();
    onselect?.();
    try {
      await openUrl(url);
    } catch {
      if (!mounted) return;
      announceOpenFailure();
    } finally {
      releaseMouseActionFocus();
    }
  }

  async function showQrForLink(url: string, e?: MouseEvent) {
    e?.stopPropagation();
    onselect?.();
    qrOpen = true;
    qrLoading = true;
    qrImageSrc = "";
    qrError = "";
    try {
      const b64 = await generateQrCode(url);
      if (!mounted) return;
      qrImageSrc = `data:image/png;base64,${b64}`;
    } catch {
      if (!mounted) return;
      qrError = "Could not generate QR code";
    } finally {
      if (mounted) qrLoading = false;
    }
  }

  async function runSmartAction(action: SmartActionInfo, e?: MouseEvent) {
    switch (action.kind) {
      case "link":
        await openSmartUrl(action.url, e);
        break;
      case "email":
        await openSmartUrl(`mailto:${action.address}`, e);
        break;
      case "phone":
        await openSmartUrl(`facetime:${phoneDialUrl(action.number)}`, e);
        break;
      case "address":
        await openSmartUrl(`maps://?address=${encodeURIComponent(action.text)}`, e);
        break;
      case "color":
        await copySmartText(action.hex, e);
        break;
      case "math":
        await copySmartText(action.result, e);
        break;
      case "json":
        await copySmartText(action.formatted, e);
        break;
      default: {
        return action satisfies never;
      }
    }
  }

  async function handleSmartPrimary(e?: MouseEvent) {
    const action = smartAction;
    if (!action) return;
    await runSmartAction(action, e);
  }

  async function handleSmartMenuSelect(id: string) {
    const action = smartAction;
    if (!action) return;
    switch (action.kind) {
      case "link":
        if (id === "copy-clean-url") await copySmartText(action.cleanUrl);
        else if (id === "make-qr") await showQrForLink(action.url);
        break;
      case "email":
        if (id === "copy-address") await copySmartText(action.address);
        break;
      case "phone":
        if (id === "facetime-audio") {
          await openSmartUrl(`facetime-audio:${phoneDialUrl(action.number)}`);
        } else if (id === "message") {
          await openSmartUrl(`sms:${phoneDialUrl(action.number)}`);
        }
        break;
      case "color":
        if (id === "copy-rgb") await copySmartText(action.rgb);
        else if (id === "copy-swiftui") await copySmartText(action.swiftUI);
        break;
      case "math":
        if (id === "paste-result") await pasteSmartText(action.result);
        break;
      case "json":
        if (id === "minify") await copySmartText(action.minified);
        else if (id === "paste-formatted") await pasteSmartText(action.formatted);
        break;
      case "address":
        break;
      default: {
        return action satisfies never;
      }
    }
  }

  function handleSmartChipClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    void handleSmartPrimary(e);
  }

  const smartAction = $derived(entry.content_type === "text" ? resolveSmartAction(entry) : null);
  const textKind = $derived(detectTextKind(entry.text_content));
  const isMonoPreview = $derived(usesMonoPreview(textKind) || smartAction?.kind === "json");
  const typeBadgeLabel = $derived(smartAction ? SMART_KIND_LABEL[smartAction.kind] : null);
  const typeBadgeColor = $derived(smartAction?.kind === "color" ? smartAction.hex : null);
  const smartPrimaryLabel = $derived(
    smartAction ? smartPrimaryActionLabel(smartAction) : "",
  );
  const smartMenuItems = $derived(smartAction ? smartContextMenuItems(smartAction) : []);
  const mathResultLine = $derived(
    smartAction?.kind === "math" ? `= ${smartAction.result}` : "",
  );
  const smartHint = $derived(
    smartAction?.kind === "link"
      ? smartAction.host
      : smartAction?.kind === "email"
        ? smartAction.address
        : smartAction?.kind === "phone"
          ? smartAction.number
          : smartAction?.kind === "address"
            ? smartAction.text
            : "",
  );
  const charLabel = $derived(entry.char_count ? `${entry.char_count.toLocaleString()} characters` : "");
  const tags = $derived(cardDisplayTags(entry, aiTaggingEnabled));
  const visibleTags = $derived(tags.slice(0, 3));
  const visibleTagLabels = $derived(visibleTags.map(formatCardTagLabel));
  const visibleTagTruncates = $derived(cardTagFooterTruncateFlags(visibleTagLabels));

  const previewText = $derived(
    entry.content_type === "text"
      ? compactVertical
        ? compactPreviewText(entry.text_content)
        : (entry.text_content ?? "")
      : "",
  );
  const ocrPreview = $derived(
    compactVertical ? "" : imageOcrPreviewText(entry.content_type, entry.ocr_text),
  );
  const hasOcrText = $derived(
    entry.content_type === "image" && !!entry.ocr_text?.trim(),
  );
  const imageFormatBadge = $derived(
    entry.content_type === "image"
      ? resolveImageFormatBadge(entry.image_format, entry.image_thumb)
      : null,
  );
  const imageFooterMeta = $derived(
    entry.content_type === "image"
      ? resolveImageFooterMetaParts(entry.image_width, entry.image_height, entry.image_byte_size)
      : null,
  );
  const canPreview = $derived(entry.content_type === "text" || entry.content_type === "image");

  let cardEl = $state<HTMLDivElement | null>(null);
  let contextMenuEl = $state<HTMLDivElement | null>(null);
  let contextMenuOpen = $state(false);
  let contextMenuPos = $state({ x: 0, y: 0 });
  let contextMenuDismissArmed = $state(false);
</script>

<div class="clipboard-card-host">
  <div
    class="card"
    bind:this={cardEl}
    class:selected
    class:pinned={entry.is_pinned}
    class:copied
    class:compact-vertical={compactVertical}
    onclick={handleClick}
    onpointerdown={handleCardPointerDown}
    oncontextmenu={handleCardContextMenu}
    onkeydown={handleCardKeydown}
    role="button"
    tabindex={selected ? 0 : -1}
  >
  <span class="sr-only" role="status" aria-live="polite">{copyAnnouncement}</span>
  <div class="card-header">
    <div class="card-type">
      {#if canPreview && smartAction}
        <div class="type-smart-row">
          <button
            class="smart-chip-btn app-btn"
            type="button"
            aria-label={smartPrimaryLabel}
            title={`${smartPrimaryLabel}${smartHint ? ` · ${smartHint}` : ""}`}
            onclick={handleSmartChipClick}
            onmousedown={(e) => e.stopPropagation()}
          >
            <CardTypeBadge
              contentType={entry.content_type}
              formatLabel={imageFormatBadge}
              labelOverride={typeBadgeLabel}
              colorHex={typeBadgeColor}
              smartKind={smartAction.kind}
              interactive
            />
          </button>
          <button
            class="type-preview-btn type-preview-btn--beside app-btn"
            type="button"
            aria-label="Open preview"
            title="Preview · Space or ⌘Y"
            onclick={handlePreviewClick}
            onmousedown={(e) => e.stopPropagation()}
          >
            <svg
              class="type-preview-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      {:else if canPreview}
        <span
          class="type-label-wrap"
          style={typeWrapWidth ? `--type-wrap-w: ${typeWrapWidth}px` : undefined}
          bind:clientWidth={typeWrapWidth}
        >
          <CardTypeBadge
            contentType={entry.content_type}
            formatLabel={imageFormatBadge}
            labelOverride={typeBadgeLabel}
            colorHex={typeBadgeColor}
          />
          <button
            class="type-preview-btn app-btn"
            type="button"
            aria-label="Open preview"
            title="Preview · Space or ⌘Y"
            onclick={handlePreviewClick}
            onmousedown={(e) => e.stopPropagation()}
          >
            <svg
              class="type-preview-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </span>
      {:else if smartAction}
        <button
          class="smart-chip-btn app-btn"
          type="button"
          aria-label={smartPrimaryLabel}
          title={`${smartPrimaryLabel}${smartHint ? ` · ${smartHint}` : ""}`}
          onclick={handleSmartChipClick}
          onmousedown={(e) => e.stopPropagation()}
        >
          <CardTypeBadge
            contentType={entry.content_type}
            formatLabel={imageFormatBadge}
            labelOverride={typeBadgeLabel}
            colorHex={typeBadgeColor}
            smartKind={smartAction.kind}
            interactive
          />
        </button>
      {:else}
        <CardTypeBadge
          contentType={entry.content_type}
          formatLabel={imageFormatBadge}
          labelOverride={typeBadgeLabel}
          colorHex={typeBadgeColor}
        />
      {/if}
      <span class="time">{timeAgo(entry.created_at)}</span>
    </div>
    <div class="card-actions">
      {#if entry.content_type === "text" || entry.content_type === "image"}
        <button
          class="action-btn app-btn paste"
          class:is-busy={pasting}
          onclick={handlePaste}
          aria-label="Paste into active app"
          aria-busy={pasting ? "true" : undefined}
          title="Paste"
        >
          <span class="app-btn-spinner" aria-hidden="true">
            <span class="app-btn-spinner-icon"></span>
          </span>
          <svg class="action-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M5.22 3.12 L5.22 10.30 C5.22 11.37 5.75 11.92 6.82 11.92 L11.68 11.92 C12.75 11.92 13.28 11.37 13.28 10.30 L13.28 3.12 C13.28 2.04 12.75 1.50 11.68 1.50 L6.82 1.50 C5.75 1.50 5.22 2.04 5.22 3.12 Z M7.99 3.27 C7.76 3.27 7.66 3.12 7.66 2.97 L7.66 2.86 C7.66 2.70 7.76 2.55 7.99 2.55 L10.51 2.55 C10.74 2.55 10.84 2.70 10.84 2.86 L10.84 2.97 C10.84 3.12 10.74 3.27 10.51 3.27 Z M2.72 12.88 C2.72 13.96 3.25 14.50 4.32 14.50 L9.18 14.50 C10.25 14.50 10.78 13.95 10.78 12.88 L10.78 8.84 C10.78 8.18 10.70 7.89 10.29 7.47 L7.44 4.57 C7.05 4.17 6.72 4.08 6.14 4.08 L4.32 4.08 C3.25 4.08 2.72 4.62 2.72 5.70 Z M3.55 12.86 L3.55 5.71 C3.55 5.20 3.82 4.91 4.36 4.91 L6.05 4.91 L6.05 7.91 C6.05 8.56 6.39 8.88 7.03 8.88 L9.95 8.88 L9.95 12.86 C9.95 13.38 9.67 13.67 9.13 13.67 L4.35 13.67 C3.82 13.67 3.55 13.38 3.55 12.86 Z M7.12 8.10 C6.92 8.10 6.83 8.02 6.83 7.81 L6.83 5.10 L9.79 8.10 Z" />
          </svg>
        </button>
      {/if}
      {#if hasOcrText}
        <button
          class="action-btn app-btn"
          onclick={handleCopyOcr}
          aria-label="Copy recognised text"
          title="Copy recognised text"
        >
          <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
            <line x1="12" y1="4" x2="12" y2="20" />
            <line x1="9" y1="20" x2="15" y2="20" />
          </svg>
        </button>
      {/if}
      {#if (entry.content_type === "text" || entry.content_type === "image") && retagAvailable}
        <button class="action-btn app-btn" onclick={handleRetag} aria-label="Retag" title="Retag">
          <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>
      {/if}
      <button
        class="action-btn app-btn"
        class:pinned={entry.is_pinned}
        onclick={handlePin}
        aria-label={entry.is_pinned ? "Unpin" : "Pin"}
        title={entry.is_pinned ? "Unpin" : "Pin"}
      >
        <svg class="action-icon" viewBox="0 0 24 24" fill={entry.is_pinned ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
      <button class="action-btn app-btn delete" onclick={handleDelete} aria-label="Delete" title="Delete">
        <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>
  </div>

  <div class="card-body">
    {#if entry.content_type === "text"}
      <div class="text-preview" class:has-math={!!mathResultLine}>
        <div class="text-content" class:mono={isMonoPreview}>{previewText}</div>
        {#if mathResultLine}
          <div class="text-content text-content--ocr math-result">{mathResultLine}</div>
        {/if}
      </div>
    {:else if entry.content_type === "image"}
      <div class="image-preview" class:has-ocr={ocrPreview.length > 0}>
        {#if entry.image_thumb}
          <img src={imageDataUrl(entry.image_thumb)} alt="Copied content" loading="lazy" decoding="async" />
        {:else}
          <div class="image-placeholder">Image</div>
        {/if}
        {#if ocrPreview}
          <div class="text-preview">
            <div class="text-content text-content--ocr" title={ocrPreview}>{ocrPreview}</div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="card-footer">
    {#if tags.length > 0}
      <div class="entry-tags">
        {#each visibleTags as tag, index (tag)}
          {@const label = visibleTagLabels[index]}
          {@const truncates = visibleTagTruncates[index]}
          <span
            class="entry-tag"
            class:entry-tag-truncates={truncates}
            title={cardTagTitle(tag, label, truncates)}
          >
            <span class="entry-tag-label">{label}</span>
          </span>
        {/each}
      </div>
    {/if}
    {#if entry.source_app || charLabel || imageFooterMeta}
      <div class="footer-row">
        {#if entry.source_app}
          <span class="source-app">{entry.source_app}</span>
        {/if}
        {#if charLabel}
          <span class="char-count">{charLabel}</span>
        {:else if imageFooterMeta}
          <span class="image-meta">
            {#if imageFooterMeta.dimensions}{imageFooterMeta.dimensions}{/if}
            {#if imageFooterMeta.dimensions && imageFooterMeta.byteSize}
              <span class="image-meta-sep" aria-hidden="true">·</span>
            {/if}
            {#if imageFooterMeta.byteSize}{imageFooterMeta.byteSize}{/if}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  {#if copied}
    <div class="copied-overlay">
      <svg class="copied-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>Copied</span>
    </div>
  {/if}
  </div>

  {#if contextMenuOpen}
    <div
      bind:this={contextMenuEl}
      class="card-context-menu"
      role="menu"
      aria-label="Card actions"
      style:left="{contextMenuPos.x}px"
      style:top="{contextMenuPos.y}px"
    >
      {#if smartMenuItems.length > 0}
        <div class="card-context-section" role="group" aria-label="Smart actions">
          {#each smartMenuItems as item, index (item.id)}
            <button
              class="card-context-item app-btn"
              class:card-context-item--primary={index === 0}
              type="button"
              role="menuitem"
              onpointerdown={(e) => e.stopPropagation()}
              onclick={() => void handleContextMenuSmart(item.id)}
            >
              {item.label}
            </button>
          {/each}
        </div>
        {#if canPreview}
          <div class="card-context-separator" role="separator"></div>
        {/if}
      {/if}
      {#if canPreview}
        <button
          class="card-context-item app-btn"
          type="button"
          role="menuitem"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={handleContextMenuPreview}
        >
          Preview
        </button>
      {/if}
    </div>
  {/if}

  <SmartQrPopover
    open={qrOpen}
    loading={qrLoading}
    imageSrc={qrImageSrc}
    error={qrError}
    onclose={closeQrPopover}
  />
</div>

<style>
  .clipboard-card-host {
    position: relative;
    display: contents;
  }

  .card {
    position: relative;
    width: var(--card-width);
    min-width: var(--card-width);
    height: var(--card-height);
    background: var(--surface-card);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-surface);
    padding: var(--radius-card-padding);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition:
      transform var(--duration-standard) var(--ease-interactive),
      border-color var(--duration-standard) var(--ease-interactive),
      background var(--duration-standard) var(--ease-interactive),
      box-shadow var(--duration-standard) var(--ease-interactive);
    font-family: inherit;
    color: inherit;
    text-align: left;
    overflow: hidden;
    flex-shrink: 0;
    /* Reserve selection ring space so selected/unselected cards keep the same footprint. */
    box-shadow: 0 0 0 2px transparent;
  }

  .card:hover:not(.selected, .copied) {
    transform: translateY(var(--card-hover-lift));
    border-color: var(--border-accent-selected);
    background: var(--surface-card-hover);
    box-shadow:
      0 0 0 2px transparent,
      var(--shadow-card);
  }

  .card.pinned:hover:not(.selected, .copied) {
    transform: translateY(var(--card-hover-lift));
    border-color: var(--border-warning-pinned-hover);
    background: var(--surface-card-hover);
    box-shadow:
      0 0 0 2px transparent,
      var(--shadow-card);
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      transition:
        border-color var(--duration-standard) var(--ease-interactive),
        background var(--duration-standard) var(--ease-interactive),
        box-shadow var(--duration-standard) var(--ease-interactive);
    }

    .card:hover:not(.copied),
    .card.selected:hover:not(.copied) {
      transform: none;
    }
  }

  .card.selected {
    background: var(--surface-card);
    border-color: var(--border-accent-ring);
    box-shadow: var(--shadow-card-selected);
  }

  .card.selected::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--surface-card-selected);
    pointer-events: none;
  }

  .card.selected:hover:not(.copied) {
    transform: translateY(var(--card-hover-lift));
    background: var(--surface-card-hover);
    border-color: var(--border-accent-selected);
    box-shadow: var(--shadow-card-selected);
  }

  .card.selected:hover:not(.copied)::before {
    display: none;
  }

  .card.selected:focus-visible {
    outline: none;
  }

  :global([data-input-modality="keyboard"]) .card.selected:focus {
    border-color: var(--border-accent-ring);
    box-shadow: var(--shadow-card-selected);
  }

  :global([data-input-modality="keyboard"]) .card.selected:hover:not(.copied),
  :global([data-input-modality="keyboard"]) .card.selected:focus:hover:not(.copied) {
    transform: translateY(var(--card-hover-lift));
    background: var(--surface-card-hover);
    border-color: var(--border-accent-ring);
    box-shadow: var(--shadow-card-selected);
  }

  .card.pinned {
    border-color: var(--border-warning-pinned);
  }

  .card.selected.pinned {
    border-color: var(--border-warning-pinned);
    box-shadow: 0 0 0 2px transparent;
  }

  .card.selected.pinned::before {
    display: none;
  }

  .card.selected.pinned:hover:not(.copied) {
    transform: translateY(var(--card-hover-lift));
    border-color: var(--border-warning-pinned-hover);
    background: var(--surface-card-hover);
    box-shadow: 0 0 0 2px transparent;
  }

  /* Keyboard/tab/arrow selection overrides pinned border so focus ring stays visible. */
  :global([data-input-modality="keyboard"]) .card.selected.pinned {
    border-color: var(--border-accent-ring);
    box-shadow: var(--shadow-card-selected);
  }

  :global([data-input-modality="keyboard"]) .card.selected.pinned::before {
    display: block;
  }

  :global([data-input-modality="keyboard"]) .card.selected.pinned:hover:not(.copied),
  :global([data-input-modality="keyboard"]) .card.selected.pinned:focus:hover:not(.copied) {
    transform: translateY(var(--card-hover-lift));
    background: var(--surface-card-hover);
    border-color: var(--border-accent-selected);
    box-shadow: var(--shadow-card-selected);
  }

  :global([data-input-modality="keyboard"]) .card.selected.pinned:focus {
    border-color: var(--border-accent-ring);
    box-shadow: var(--shadow-card-selected);
  }

  .card-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--card-type-gap);
    margin-bottom: var(--space-stack);
    flex-shrink: 0;
  }

  .card-type {
    display: flex;
    flex-direction: column;
    gap: var(--space-segment-inset);
    min-width: 0;
    flex: 1 1 auto;
    padding-right: 0;
  }

  .type-label-wrap {
    position: relative;
    display: inline-flex;
    align-self: flex-start;
    width: fit-content;
    vertical-align: top;
    max-width: var(--card-type-expand-max);
    height: var(--size-card-action-hit);
    overflow: hidden;
    border-radius: var(--radius-pill);
    clip-path: inset(0 0 0 0 round var(--radius-pill));
    transition: clip-path var(--duration-card-type-collapse) ease-in-out;
    will-change: clip-path;
  }

  .type-label-wrap > :global(.card-type-badge) {
    position: relative;
    z-index: 1;
    min-width: 0;
    /* Decorative only — never intercept the eye button underneath once the
       icon fades out and the pill collapses over it. */
    pointer-events: none;
  }

  /* Only the icon crossfades with the eye (they share the same 40px slot).
     The label never fades — clip-path alone crops it away, so the visible
     sliver of text shrinks cleanly instead of also blinking out. */
  .type-label-wrap > :global(.card-type-badge) :global(.card-type-badge-icon) {
    opacity: 0.92;
    transition: opacity var(--duration-card-type-collapse) ease-in-out;
    will-change: opacity;
  }

  /* The label sits right after the icon (~26px in), well inside the 40px
     preview slot — clip it away in lockstep with the pill so no sliver of
     text peeks out once collapsed, regardless of where it starts. */
  .type-label-wrap > :global(.card-type-badge) :global(.card-type-badge-label) {
    display: inline-block;
    clip-path: inset(0 0 0 0);
    transition: clip-path var(--duration-card-type-collapse) ease-in-out;
    will-change: clip-path;
  }

  .card:hover .type-label-wrap > :global(.card-type-badge) :global(.card-type-badge-icon),
  .type-label-wrap:focus-within > :global(.card-type-badge) :global(.card-type-badge-icon),
  :global([data-input-modality="keyboard"])
    .card.selected:focus-within
    .type-label-wrap
    > :global(.card-type-badge)
    :global(.card-type-badge-icon) {
    opacity: 0;
  }

  .card:hover .type-label-wrap > :global(.card-type-badge) :global(.card-type-badge-label),
  .type-label-wrap:focus-within > :global(.card-type-badge) :global(.card-type-badge-label),
  :global([data-input-modality="keyboard"])
    .card.selected:focus-within
    .type-label-wrap
    > :global(.card-type-badge)
    :global(.card-type-badge-label) {
    clip-path: inset(0 100% 0 0);
  }

  .type-preview-btn {
    position: absolute;
    inset: 0 auto auto 0;
    z-index: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(--card-type-preview-width);
    height: 100%;
    margin: 0;
    padding: 0;
    border: 1px solid transparent;
    border-radius: inherit;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    box-shadow: none;
    transition:
      opacity var(--duration-card-type-collapse) ease-in-out,
      background var(--duration-fast) var(--ease-interactive),
      color var(--duration-fast) var(--ease-interactive),
      border-color var(--duration-fast) var(--ease-interactive),
      filter var(--duration-micro) var(--ease-interactive),
      box-shadow var(--duration-micro) var(--ease-interactive);
  }

  .type-preview-icon {
    display: block;
    width: var(--icon-size-card-action);
    height: var(--icon-size-card-action);
    flex-shrink: 0;
  }

  .card:hover .type-label-wrap,
  .type-label-wrap:focus-within,
  :global([data-input-modality="keyboard"]) .card.selected:focus-within .type-label-wrap {
    /* Pure px calc() (no %) keeps this on the compositor thread instead of
       triggering a layout read every frame. */
    clip-path: inset(
      0 calc(var(--type-wrap-w, 100%) - var(--card-type-preview-width)) 0 0 round
        var(--radius-pill)
    );
  }

  .card:hover .type-preview-btn,
  .type-label-wrap:focus-within .type-preview-btn,
  :global([data-input-modality="keyboard"]) .card.selected:focus-within .type-preview-btn {
    opacity: 1;
    pointer-events: auto;
    background: var(--surface-8);
    border-color: var(--border-soft);
    color: var(--color-text-body);
  }

  .type-preview-btn:hover:not(:disabled) {
    color: var(--color-text-bright);
    background: var(--surface-15);
    border-color: rgb(var(--rgb-white) / 20%);
  }

  .type-preview-btn:active:not(:disabled) {
    filter: brightness(0.88);
    background: var(--surface-12);
    box-shadow: var(--shadow-inset-press);
    transition-duration: var(--duration-micro);
  }

  .type-preview-btn:hover:active:not(:disabled) {
    filter: brightness(0.85);
    background: var(--surface-10);
  }

  .type-preview-btn:focus-visible,
  :global([data-input-modality="keyboard"]) .type-preview-btn:focus:not(:disabled) {
    outline: none;
    box-shadow: var(--ring-accent-input);
  }

  .type-preview-btn:focus-visible:active:not(:disabled),
  :global([data-input-modality="keyboard"]) .type-preview-btn:focus:active:not(:disabled) {
    box-shadow: var(--shadow-inset-press), var(--ring-accent-input);
  }

  /* Smart cards: keep the type chip as the primary action; show Quick Look beside it. */
  .type-smart-row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-segment-inset);
    max-width: 100%;
    min-width: 0;
  }

  .type-preview-btn--beside {
    position: static;
    inset: auto;
    z-index: auto;
    width: var(--size-card-action-hit);
    height: var(--size-card-action-hit);
    border-radius: var(--radius-pill);
    flex-shrink: 0;
  }

  .card:hover .type-preview-btn--beside,
  .type-smart-row:focus-within .type-preview-btn--beside,
  :global([data-input-modality="keyboard"]) .card.selected:focus-within .type-preview-btn--beside {
    opacity: 1;
    pointer-events: auto;
    background: var(--surface-8);
    border-color: var(--border-soft);
    color: var(--color-text-body);
  }

  .smart-chip-btn {
    display: inline-flex;
    align-items: center;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
  }

  .smart-chip-btn:focus-visible,
  :global([data-input-modality="keyboard"]) .smart-chip-btn:focus {
    outline: none;
    box-shadow: var(--ring-accent-input);
  }

  .text-preview .math-result {
    margin-top: 0.25rem;
  }

  .time {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .card-actions {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    gap: var(--space-segment-inset);
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    pointer-events: none;
  }

  .card:hover .card-actions,
  .card.pinned .card-actions,
  :global([data-input-modality="keyboard"]) .card.selected:focus-within .card-actions {
    pointer-events: auto;
  }

  .card-actions .action-btn {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-interactive);
  }

  .card:hover .card-actions .action-btn,
  :global([data-input-modality="keyboard"]) .card.selected:focus-within .card-actions .action-btn {
    opacity: 1;
    pointer-events: auto;
  }

  .card.pinned .card-actions .action-btn.pinned {
    opacity: 1;
    pointer-events: auto;
  }

  .action-btn.paste {
    border: 1px solid transparent;
  }

  .action-btn.paste:hover:not(:disabled, [aria-busy="true"]),
  .action-btn.paste:focus-visible:not(:disabled, [aria-busy="true"]),
  :global([data-input-modality="keyboard"]) .action-btn.paste:focus:not(:disabled, [aria-busy="true"]) {
    background: var(--surface-accent-muted);
    border-color: var(--border-accent-soft);
    color: var(--color-accent-text-soft);
  }

  .action-btn.paste:hover:not(:disabled, [aria-busy="true"]) {
    background: var(--surface-accent-hover);
    border-color: var(--border-accent-medium);
    color: var(--color-accent-text);
  }

  .action-btn.is-busy .action-icon {
    opacity: 0;
  }

  .action-btn.is-busy {
    opacity: 0.7;
  }

  .action-btn.pinned {
    color: var(--color-warning-bright);
    background: var(--surface-warning-subtle);
    box-shadow: inset 0 0 0 1px var(--border-warning);
    transition:
      background var(--duration-fast) var(--ease-interactive),
      box-shadow var(--duration-fast) var(--ease-interactive),
      color var(--duration-fast) var(--ease-interactive);
  }

  .action-btn.pinned:hover:not(:disabled, [aria-busy="true"]) {
    color: var(--color-warning-bright);
    background: var(--surface-warning);
    box-shadow: inset 0 0 0 1px var(--border-warning-hover);
  }

  .card-body {
    flex: 0 0 var(--card-preview-height);
    height: var(--card-preview-height);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .text-preview {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    box-sizing: border-box;
    padding: var(--card-text-preview-pad);
    background: var(--surface-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-inset);
    overflow: hidden;
  }

  .text-preview.has-math {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .text-preview.has-math .text-content:first-child {
    -webkit-line-clamp: 6;
    line-clamp: 6;
  }

  .text-content.mono {
    font-family: var(--font-family-mono);
  }

  .text-content:not(.mono) {
    font-family: inherit;
  }

  .text-content {
    min-height: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--font-size-sm);
    line-height: 1.55;
    color: var(--color-text-primary);
    white-space: pre-line;
    word-break: normal;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--text-preview-line-clamp, 8);
    line-clamp: var(--text-preview-line-clamp, 8);
    text-overflow: ellipsis;
  }

  /* OCR-derived text: same box rules as copied text, quieter secondary tone (HIG). */
  .text-content--ocr {
    color: var(--color-text-tertiary);
    font-weight: 400;
  }

  .image-preview {
    display: flex;
    flex-direction: column;
    gap: var(--card-image-preview-gap);
    height: 100%;
    min-height: 0;
  }

  .image-preview.has-ocr .text-preview {
    --text-preview-line-clamp: var(--card-ocr-line-clamp);
    flex: 1 1 0;
    min-height: 0;
    padding: var(--card-text-preview-pad-ocr);
  }

  .image-preview.has-ocr img,
  .image-preview.has-ocr .image-placeholder {
    flex-shrink: 0;
    height: var(--card-image-thumb-h-ocr);
  }

  .image-preview img {
    width: 100%;
    height: var(--card-image-thumb-h-only);
    border-radius: var(--radius-inset);
    object-fit: cover;
    display: block;
    border: 1px solid var(--border-soft);
    box-shadow: var(--shadow-image);
  }

  .image-placeholder {
    width: 100%;
    height: var(--card-image-thumb-h-only);
    background: var(--surface-5);
    border-radius: var(--radius-inset);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-subtle);
    font-size: var(--font-size-md);
  }

  .card-footer {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--space-stack);
    flex-shrink: 0;
    min-height: var(--card-footer-min-height);
    margin-top: auto;
    padding-top: var(--space-stack);
  }

  .footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .source-app {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-tags {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: var(--space-row);
    overflow: hidden;
    min-width: 0;
  }

  .entry-tag {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    max-width: 100%;
    padding: var(--card-entry-tag-pad);
    border-radius: var(--radius-control-sm);
    border: 1px solid var(--border-entry-tag);
    background: var(--surface-entry-tag);
    color: var(--color-entry-tag);
    font-size: var(--font-size-2xs);
    line-height: 1.3;
    font-weight: 500;
  }

  .entry-tag-truncates {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .entry-tag-label {
    letter-spacing: 0.01em;
    text-transform: lowercase;
    white-space: nowrap;
  }

  .entry-tag-truncates .entry-tag-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .char-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-faint);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .image-meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 1 auto;
    min-width: 0;
    margin-left: auto;
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    color: var(--color-text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }

  .image-meta-sep {
    flex-shrink: 0;
    margin-inline: 0.3125rem;
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1;
    color: var(--color-text-muted);
    user-select: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .card.copied {
    border-color: var(--border-success);
    box-shadow: 0 0 0 2px var(--shadow-success);
  }

  .copied-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--surface-overlay);
    backdrop-filter: blur(6px);
    border-radius: var(--radius-surface);
    color: var(--color-success);
    font-size: var(--font-size-lg);
    font-weight: 700;
    letter-spacing: 0.02em;
    animation: copied-pop var(--duration-hud) var(--ease-out-expo);
    z-index: 5;
  }

  .copied-overlay .copied-icon {
    width: var(--icon-size-card-copied);
    height: var(--icon-size-card-copied);
    flex-shrink: 0;
    animation: copied-icon-pop var(--duration-hud) var(--ease-interactive) forwards;
  }

  .card.compact-vertical .copied-overlay {
    gap: var(--card-copied-gap-vertical);
    font-size: var(--card-copied-label-size-vertical);
  }

  .card.compact-vertical .copied-overlay .copied-icon {
    width: var(--card-copied-icon-size-vertical);
    height: var(--card-copied-icon-size-vertical);
  }

  @keyframes copied-icon-pop {
    from {
      opacity: 0;
      transform: scale(0.75);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes copied-pop {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .copied-overlay {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .copied-overlay {
      animation: copied-fade var(--duration-hud) var(--ease-interactive);
    }

    .copied-overlay .copied-icon {
      animation: none;
    }
  }

  @keyframes copied-fade {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  .card-context-menu {
    position: fixed;
    z-index: 90;
    display: flex;
    flex-direction: column;
    min-width: 11.5rem;
    max-width: 16rem;
    padding: 0.25rem;
    background: var(--surface-menu);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    box-shadow: var(--shadow-elevated);
    pointer-events: auto;
  }

  .card-context-section {
    display: flex;
    flex-direction: column;
  }

  .card-context-separator {
    height: 1px;
    margin: 0.25rem 0.375rem;
    background: var(--border-soft);
  }

  .card-context-item {
    justify-content: flex-start;
    width: 100%;
    padding: 0.4375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: calc(var(--radius-control) - 2px);
    color: var(--color-text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .card-context-item--primary {
    font-weight: 600;
    color: var(--color-accent-text-soft);
  }

  .card-context-item:hover:not(:disabled),
  .card-context-item:focus-visible {
    background: var(--surface-menu-hover);
    outline: none;
  }

  .card-context-item--primary:hover:not(:disabled),
  .card-context-item--primary:focus-visible {
    color: var(--color-accent-text);
    background: var(--surface-accent-muted);
  }
</style>
