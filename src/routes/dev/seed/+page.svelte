<script lang="ts">
  import { seedDemoEntries } from "$lib/api";

  let status = $state<string | null>(null);
  let busy = $state(false);

  async function runSeed() {
    busy = true;
    status = null;
    try {
      const result = await seedDemoEntries();
      status = `Done — removed ${result.removed}, inserted ${result.inserted} demo entries. Reopen the overlay to refresh.`;
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Demo seed</title>
</svelte:head>

<main class="page">
  <h1>Demo seed</h1>
  <p>
    Inserts clipboard history fixtures for Smart Actions, Quick Look, and resize testing. Entries
    use <code>demo:</code> content hashes and are replaced on each run.
  </p>
  <button type="button" class="seed-btn" disabled={busy} onclick={runSeed}>
    {busy ? "Seeding…" : "Seed demo entries"}
  </button>
  {#if status}
    <p class="status" role="status">{status}</p>
  {/if}

  <section class="cases">
    <h2>Fixture coverage</h2>
    <ul>
      <li><strong>Link</strong> — tracking params, clean URL, http (pinned for Starred tab)</li>
      <li><strong>Email</strong> — bare address, long domain</li>
      <li><strong>Phone</strong> — international + local formats</li>
      <li><strong>Address</strong> — two US-style strings</li>
      <li><strong>Color</strong> — #hex, #fff, rgb(), rgba()</li>
      <li><strong>Calc</strong> — 18*24+7, (2+3)*4, 2^10</li>
      <li><strong>JSON</strong> — object + array</li>
      <li><strong>Negative</strong> — phone in sentence, hex in CSS, plain text, 2100-char string</li>
      <li><strong>Quick Look</strong> — long text, Python, Rust; PNG (320×200), OCR image, GIF</li>
    </ul>
    <p class="hint">CLI: <code>make seed-demo</code> (no running app required).</p>
  </section>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: #0b0f14;
    color: var(--color-text-primary, #e8edf2);
    font-family: "SF Pro Text", system-ui, sans-serif;
  }

  .page {
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
  }

  p {
    line-height: 1.5;
    color: var(--color-text-muted, #9aa7b5);
  }

  code {
    font-family: "SF Mono", ui-monospace, monospace;
    font-size: 0.875em;
  }

  .seed-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 8px;
    background: #3b82f6;
    color: var(--color-text-on-accent, #fff);
    font-size: 0.9375rem;
    cursor: pointer;
  }

  .seed-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .status {
    margin-top: 1rem;
    color: var(--color-text-primary, #e8edf2);
  }

  .cases {
    margin-top: 2rem;
  }

  .cases h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }

  .cases ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--color-text-muted, #9aa7b5);
    line-height: 1.55;
  }

  .hint {
    margin-top: 1rem;
    font-size: 0.875rem;
  }
</style>
