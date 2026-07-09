import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectColor,
  detectJson,
  detectMath,
  evaluateMathExpression,
  isValidJson,
  phoneDialUrl,
  resolveSmartAction,
  smartContextMenuItems,
  smartPrimaryActionLabel,
  smartSecondaryMenuItems,
  stripTrackingParams,
} from "./smart-actions.ts";
import type { ClipboardEntry } from "./types.ts";

function makeEntry(overrides: Partial<ClipboardEntry> = {}): ClipboardEntry {
  return {
    id: 1,
    content_type: "text",
    text_content: "",
    image_data: null,
    image_thumb: null,
    source_app: null,
    source_app_icon: null,
    content_hash: "h",
    char_count: null,
    created_at: "2026-01-01T00:00:00Z",
    is_pinned: false,
    collection_id: null,
    tags: [],
    ...overrides,
  };
}

describe("isValidJson", () => {
  it("accepts valid JSON objects and arrays", () => {
    assert.equal(isValidJson('{"a":1}'), true);
    assert.equal(isValidJson("[1,2]"), true);
  });

  it("rejects invalid JSON", () => {
    assert.equal(isValidJson("{not json"), false);
    assert.equal(isValidJson("hello"), false);
    assert.equal(isValidJson(""), false);
    assert.equal(isValidJson("a".repeat(10000)), false);
  });
});

describe("detectColor", () => {
  it("parses hex and rgb colors", () => {
    const hex = detectColor("#3A7BD5");
    assert.equal(hex?.kind, "color");
    assert.equal(hex && hex.kind === "color" ? hex.hex : null, "#3A7BD5");
    assert.equal(hex && hex.kind === "color" ? hex.rgb : null, "rgb(58, 123, 213)");
    assert.match(hex && hex.kind === "color" ? hex.swiftUI : "", /Color\(red:/);

    const rgb = detectColor("rgb(58, 123, 213)");
    assert.equal(rgb && rgb.kind === "color" ? rgb.hex : null, "#3A7BD5");
  });

  it("parses shorthand hex and rgba", () => {
    const short = detectColor("#fff");
    assert.equal(short && short.kind === "color" ? short.hex : null, "#FFFFFF");

    const rgba = detectColor("rgba(0, 0, 0, 0.5)");
    assert.equal(rgba && rgba.kind === "color" ? rgba.rgb : null, "rgb(0, 0, 0)");
    assert.match(rgba && rgba.kind === "color" ? rgba.swiftUI : "", /Color\(red: 0\.000/);
  });

  it("rejects non-whole-string colors", () => {
    assert.equal(detectColor("redish"), null);
    assert.equal(detectColor("color: #3A7BD5;"), null);
    assert.equal(detectColor(null), null);
    assert.equal(detectColor("rgb(300, 0, 0)"), null);
  });
});

describe("evaluateMathExpression", () => {
  it("evaluates expressions with precedence", () => {
    assert.equal(evaluateMathExpression("18*24+7"), "439");
    assert.equal(evaluateMathExpression("(2+3)*4"), "20");
    assert.equal(evaluateMathExpression("2^3"), "8");
  });

  it("rejects invalid expressions", () => {
    assert.equal(evaluateMathExpression("10/0"), null);
    assert.equal(evaluateMathExpression("2024"), null);
    assert.equal(evaluateMathExpression("not math"), null);
    assert.equal(evaluateMathExpression("2024-01-01"), null);
    assert.equal(evaluateMathExpression("123-456"), null);
    assert.equal(evaluateMathExpression("01/02/2024"), null);
  });
});

describe("detectMath", () => {
  it("returns expression and result", () => {
    assert.deepEqual(detectMath("18*24+7"), {
      kind: "math",
      expression: "18*24+7",
      result: "439",
    });
  });
});

describe("detectJson", () => {
  it("returns formatted and minified variants", () => {
    const json = detectJson('{"a":1}');
    assert.equal(json?.kind, "json");
    assert.equal(json && json.kind === "json" ? json.minified : null, '{"a":1}');
    assert.match(json && json.kind === "json" ? json.formatted : "", /"a": 1/);

    const array = detectJson("[1,2]");
    assert.equal(array?.kind, "json");
    assert.equal(array && array.kind === "json" ? array.minified : null, "[1,2]");
  });

  it("returns null for invalid JSON", () => {
    assert.equal(detectJson("{bad"), null);
  });
});

describe("stripTrackingParams", () => {
  it("removes tracking params while keeping real params", () => {
    assert.equal(
      stripTrackingParams("https://example.com?utm_source=x&id=1"),
      "https://example.com/?id=1",
    );
    assert.equal(stripTrackingParams("https://example.com?fbclid=abc"), "https://example.com/");
    assert.equal(
      stripTrackingParams("https://example.com?gclid=abc&ref=home"),
      "https://example.com/",
    );
  });

  it("leaves URLs without query strings unchanged", () => {
    assert.equal(stripTrackingParams("https://example.com"), "https://example.com");
    assert.equal(stripTrackingParams("https://example.com/path"), "https://example.com/path");
  });
});

describe("phoneDialUrl", () => {
  it("normalizes international and local numbers", () => {
    assert.equal(phoneDialUrl("+1 (415) 555-2671"), "+14155552671");
    assert.equal(phoneDialUrl("(415) 555-2671"), "4155552671");
  });
});

describe("resolveSmartAction", () => {
  it("prefers server smart_kind over client detectors", () => {
    const action = resolveSmartAction(
      makeEntry({
        text_content: "#3A7BD5",
        smart_kind: "link",
        smart_value: "https://example.com?utm_source=x",
      }),
    );
    assert.equal(action?.kind, "link");
    if (action?.kind === "link") {
      assert.equal(action.host, "example.com");
      assert.equal(action.cleanUrl, "https://example.com/");
      assert.equal(action.url, "https://example.com?utm_source=x");
    }
  });

  it("maps server email, phone, and address kinds", () => {
    assert.deepEqual(
      resolveSmartAction(makeEntry({ smart_kind: "email", smart_value: "jane@example.com" })),
      { kind: "email", address: "jane@example.com" },
    );
    assert.deepEqual(
      resolveSmartAction(makeEntry({ smart_kind: "phone", smart_value: "+1 415-555-2671" })),
      { kind: "phone", number: "+1 415-555-2671" },
    );
    assert.deepEqual(
      resolveSmartAction(makeEntry({ smart_kind: "address", smart_value: "1 Infinite Loop" })),
      { kind: "address", text: "1 Infinite Loop" },
    );
  });

  it("falls back to client detectors in order", () => {
    assert.equal(resolveSmartAction(makeEntry({ text_content: "#3A7BD5" }))?.kind, "color");
    assert.equal(resolveSmartAction(makeEntry({ text_content: "18*24+7" }))?.kind, "math");
    assert.equal(resolveSmartAction(makeEntry({ text_content: '{"a":1}' }))?.kind, "json");
  });

  it("returns null for non-text entries", () => {
    assert.equal(resolveSmartAction(makeEntry({ content_type: "image" })), null);
  });
});

describe("smartSecondaryMenuItems", () => {
  it("returns link menu items with ids", () => {
    assert.deepEqual(
      smartSecondaryMenuItems({
        kind: "link",
        url: "https://example.com",
        cleanUrl: "https://example.com",
        host: "example.com",
      }),
      [
        { id: "copy-clean-url", label: "Copy tracking-free URL" },
        { id: "make-qr", label: "Make QR code" },
      ],
    );
  });

  it("returns empty list for address", () => {
    assert.deepEqual(smartSecondaryMenuItems({ kind: "address", text: "1 Infinite Loop" }), []);
  });
});

describe("smartContextMenuItems", () => {
  it("prepends the primary action", () => {
    assert.deepEqual(
      smartContextMenuItems({
        kind: "link",
        url: "https://example.com",
        cleanUrl: "https://example.com",
        host: "example.com",
      }),
      [
        { id: "smart-primary", label: "Open link" },
        { id: "copy-clean-url", label: "Copy tracking-free URL" },
        { id: "make-qr", label: "Make QR code" },
      ],
    );
  });

  it("still includes primary when there are no secondaries", () => {
    assert.deepEqual(smartContextMenuItems({ kind: "address", text: "1 Infinite Loop" }), [
      { id: "smart-primary", label: "Open in Maps" },
    ]);
  });
});

describe("smartPrimaryActionLabel", () => {
  it("returns labels for each kind", () => {
    assert.equal(
      smartPrimaryActionLabel({ kind: "link", url: "", cleanUrl: "", host: "" }),
      "Open link",
    );
    assert.equal(
      smartPrimaryActionLabel({ kind: "color", hex: "#fff", rgb: "", swiftUI: "" }),
      "Copy HEX",
    );
    assert.equal(
      smartPrimaryActionLabel({ kind: "math", expression: "1+1", result: "2" }),
      "Copy result",
    );
  });
});
