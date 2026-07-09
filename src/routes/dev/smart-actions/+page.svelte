<script lang="ts">
  import ClipboardCard from "$lib/components/ClipboardCard.svelte";
  import type { ClipboardEntry } from "$lib/types";

  function entry(
    id: number,
    text: string,
    overrides: Partial<ClipboardEntry> = {},
  ): ClipboardEntry {
    return {
      id,
      content_type: "text",
      text_content: text,
      image_data: null,
      image_thumb: null,
      source_app: "Safari",
      source_app_icon: null,
      content_hash: `h-${id}`,
      char_count: text.length,
      created_at: new Date(Date.now() - id * 60_000).toISOString(),
      is_pinned: false,
      collection_id: null,
      tags: [],
      ...overrides,
    };
  }

  const samples: ClipboardEntry[] = [
    entry(1, "https://github.com/copyosity/app?utm_source=twitter&fbclid=abc", {
      smart_kind: "link",
      smart_value: "https://github.com/copyosity/app?utm_source=twitter&fbclid=abc",
      source_app: "Chrome",
    }),
    entry(2, "hello@copyosity.app", {
      smart_kind: "email",
      smart_value: "hello@copyosity.app",
      source_app: "Mail",
    }),
    entry(3, "+1 (415) 555-0199", {
      smart_kind: "phone",
      smart_value: "+1 (415) 555-0199",
      source_app: "Contacts",
    }),
    entry(4, "1 Infinite Loop, Cupertino, CA", {
      smart_kind: "address",
      smart_value: "1 Infinite Loop, Cupertino, CA",
      source_app: "Notes",
    }),
    entry(5, "#3A7BD5", { source_app: "Figma" }),
    entry(6, "(12 + 8) * 3 / 2", { source_app: "Calculator" }),
    entry(7, '{"name":"Copyosity","version":"0.6.2","features":["smart","ql"]}', {
      source_app: "VS Code",
    }),
    entry(8, "Plain note without smart detection — just text for comparison.", {
      source_app: "Notes",
      tags: ["notes"],
    }),
  ];

  let selectedId = $state(1);
</script>

<svelte:head>
  <title>Smart Actions gallery</title>
</svelte:head>

<main class="gallery">
  <header class="gallery-header">
    <h1>Smart Actions gallery</h1>
    <p>
      Click the type chip for the primary action. Right-click a card for the full action panel
      (Raycast/Alfred-style). Hover for Paste / Pin / Delete — no extra smart icon buttons.
    </p>
  </header>

  <div class="gallery-grid" role="list">
    {#each samples as sample (sample.id)}
      <div class="card-wrapper" role="listitem">
        <ClipboardCard
          entry={sample}
          selected={selectedId === sample.id}
          onselect={() => {
            selectedId = sample.id;
          }}
          onpreview={() => {
            selectedId = sample.id;
          }}
        />
      </div>
    {/each}
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background:
      radial-gradient(1200px 600px at 10% -10%, rgb(16 185 129 / 18%), transparent 55%),
      radial-gradient(900px 500px at 90% 0%, rgb(59 130 246 / 12%), transparent 50%),
      #0b0f14;
    color: var(--color-text-primary, #e8edf2);
    font-family:
      "SF Pro Text",
      "Segoe UI",
      system-ui,
      sans-serif;
  }

  .gallery {
    box-sizing: border-box;
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 3rem;
  }

  .gallery-header {
    margin-bottom: 1.5rem;
  }

  .gallery-header h1 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }

  .gallery-header p {
    margin: 0;
    max-width: 42rem;
    color: var(--color-text-muted, #9aa7b5);
    font-size: 0.9375rem;
    line-height: 1.45;
  }

  .gallery-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-start;
  }

  .card-wrapper {
    display: flex;
  }
</style>
