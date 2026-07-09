import type { ClipboardEntry } from "$lib/types";

export type SmartKind = "link" | "email" | "phone" | "address" | "color" | "math" | "json";

export type SmartActionInfo =
  | { kind: "link"; url: string; cleanUrl: string; host: string }
  | { kind: "email"; address: string }
  | { kind: "phone"; number: string }
  | { kind: "address"; text: string }
  | { kind: "color"; hex: string; rgb: string; swiftUI: string }
  | { kind: "math"; expression: string; result: string }
  | { kind: "json"; formatted: string; minified: string };

export const SMART_KIND_LABEL: Record<SmartKind, string> = {
  link: "Link",
  email: "Email",
  phone: "Phone",
  address: "Address",
  color: "Color",
  math: "Calc",
  json: "JSON",
};

const TRACKING_PARAM_PREFIXES = ["utm_"] as const;
const TRACKING_PARAM_KEYS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "si",
  "ref",
  "ref_src",
  "spm",
  "yclid",
  "twclid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
]);

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR_RE =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

export function isValidJson(text: string): boolean {
  const sample = text.trim();
  if (sample.length === 0 || sample.length >= 10000) return false;
  if (
    !(sample.startsWith("{") && sample.endsWith("}")) &&
    !(sample.startsWith("[") && sample.endsWith("]"))
  ) {
    return false;
  }
  try {
    JSON.parse(sample);
    return true;
  } catch {
    return false;
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function expandHexDigit(d: string): string {
  return d + d;
}

function hexFromChannels(r: number, g: number, b: number): string {
  const toHex = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbString(r: number, g: number, b: number): string {
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
}

function swiftUIColor(r: number, g: number, b: number): string {
  const channel = (n: number) => (clampByte(n) / 255).toFixed(3);
  return `Color(red: ${channel(r)}, green: ${channel(g)}, blue: ${channel(b)})`;
}

function colorInfoFromChannels(
  r: number,
  g: number,
  b: number,
): {
  hex: string;
  rgb: string;
  swiftUI: string;
} {
  return {
    hex: hexFromChannels(r, g, b),
    rgb: rgbString(r, g, b),
    swiftUI: swiftUIColor(r, g, b),
  };
}

function parseHexColor(text: string): { hex: string; rgb: string; swiftUI: string } | null {
  if (!HEX_COLOR_RE.test(text)) return null;
  let raw = text.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    raw = raw.slice(0, 3).split("").map(expandHexDigit).join("");
  } else if (raw.length === 8) {
    raw = raw.slice(0, 6);
  }
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return colorInfoFromChannels(r, g, b);
}

function parseRgbColor(text: string): { hex: string; rgb: string; swiftUI: string } | null {
  const match = RGB_COLOR_RE.exec(text.trim());
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if (r > 255 || g > 255 || b > 255) return null;
  return colorInfoFromChannels(r, g, b);
}

export function detectColor(text: string | null): SmartActionInfo | null {
  if (!text) return null;
  const sample = text.trim();
  const parsed = parseHexColor(sample) ?? parseRgbColor(sample);
  if (!parsed) return null;
  return { kind: "color", ...parsed };
}

function formatMathResult(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Number.parseFloat(value.toPrecision(6));
  if (!Number.isFinite(rounded)) return null;
  return String(rounded);
}

type MathToken =
  | { type: "number"; value: number }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenizeMathExpression(input: string): MathToken[] | null {
  const tokens: MathToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/\d|\./.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[\d.]/.test(input[j]!)) j += 1;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) return null;
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }
    if ("+-*/%^()".includes(ch)) {
      if (ch === "(") tokens.push({ type: "lparen" });
      else if (ch === ")") tokens.push({ type: "rparen" });
      else tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

class MathParser {
  private readonly tokens: MathToken[];
  private index = 0;

  constructor(tokens: MathToken[]) {
    this.tokens = tokens;
  }

  parse(): number | null {
    const value = this.parseExpression();
    if (value === null || this.index !== this.tokens.length) return null;
    return value;
  }

  private parseExpression(): number | null {
    let value = this.parseTerm();
    if (value === null) return null;
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index];
      if (!token || token.type !== "op" || (token.value !== "+" && token.value !== "-")) {
        break;
      }
      this.index += 1;
      const rhs = this.parseTerm();
      if (rhs === null) return null;
      value = token.value === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number | null {
    let value = this.parsePower();
    if (value === null) return null;
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index];
      if (!token || token.type !== "op" || !["*", "/", "%"].includes(token.value)) {
        break;
      }
      this.index += 1;
      const rhs = this.parsePower();
      if (rhs === null) return null;
      if (token.value === "*") value *= rhs;
      else if (token.value === "/") {
        if (rhs === 0) return null;
        value /= rhs;
      } else {
        if (rhs === 0) return null;
        value %= rhs;
      }
    }
    return value;
  }

  private parsePower(): number | null {
    let value = this.parseUnary();
    if (value === null) return null;
    const token = this.tokens[this.index];
    if (token?.type === "op" && token.value === "^") {
      this.index += 1;
      const rhs = this.parsePower();
      if (rhs === null) return null;
      value = value ** rhs;
    }
    return value;
  }

  private parseUnary(): number | null {
    const token = this.tokens[this.index];
    if (token?.type === "op" && token.value === "-") {
      this.index += 1;
      const value = this.parseUnary();
      if (value === null) return null;
      return -value;
    }
    if (token?.type === "op" && token.value === "+") {
      this.index += 1;
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number | null {
    const token = this.tokens[this.index];
    if (!token) return null;
    if (token.type === "number") {
      this.index += 1;
      return token.value;
    }
    if (token.type === "lparen") {
      this.index += 1;
      const value = this.parseExpression();
      const closing = this.tokens[this.index];
      if (value === null || closing?.type !== "rparen") return null;
      this.index += 1;
      return value;
    }
    return null;
  }
}

export function evaluateMathExpression(input: string): string | null {
  const sample = input.trim();
  if (!/^[\d+\-*/%^().\s]+$/.test(sample)) return null;
  // Reject date-like and dashed numeric codes; require real operators beyond lone subtraction.
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(sample)) return null;
  if (/^\d{1,4}\/\d{1,2}\/\d{1,4}$/.test(sample)) return null;
  if (!/[+*/%^()]/.test(sample.replace(/^-/, ""))) return null;
  const tokens = tokenizeMathExpression(sample);
  if (!tokens || tokens.length === 0) return null;
  const value = new MathParser(tokens).parse();
  if (value === null) return null;
  return formatMathResult(value);
}

export function detectMath(text: string | null): SmartActionInfo | null {
  if (!text) return null;
  const expression = text.trim();
  const result = evaluateMathExpression(expression);
  if (result === null) return null;
  return { kind: "math", expression, result };
}

export function detectJson(text: string | null): SmartActionInfo | null {
  if (!text || !isValidJson(text)) return null;
  const sample = text.trim();
  const parsed = JSON.parse(sample) as unknown;
  return {
    kind: "json",
    formatted: JSON.stringify(parsed, null, 2),
    minified: JSON.stringify(parsed),
  };
}

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    let changed = false;
    const keys = Array.from(parsed.searchParams.keys());
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (
        TRACKING_PARAM_KEYS.has(lower) ||
        TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
      ) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return url;
    const cleaned = parsed.toString();
    return cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url;
  }
}

function linkInfoFromUrl(url: string): SmartActionInfo {
  const cleanUrl = stripTrackingParams(url);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep raw url as host fallback
  }
  return { kind: "link", url, cleanUrl, host };
}

function serverSmartAction(entry: ClipboardEntry): SmartActionInfo | null {
  const kind = entry.smart_kind;
  const value = entry.smart_value?.trim();
  if (!kind || !value) return null;

  switch (kind) {
    case "link":
      return linkInfoFromUrl(value);
    case "email":
      return { kind: "email", address: value };
    case "phone":
      return { kind: "phone", number: value };
    case "address":
      return { kind: "address", text: value };
    default: {
      return kind satisfies never;
    }
  }
}

export function resolveSmartAction(entry: ClipboardEntry): SmartActionInfo | null {
  if (entry.content_type !== "text") return null;

  const fromServer = serverSmartAction(entry);
  if (fromServer) return fromServer;

  return (
    detectColor(entry.text_content) ??
    detectMath(entry.text_content) ??
    detectJson(entry.text_content)
  );
}

export type SmartMenuItem = {
  id: string;
  label: string;
};

export function smartSecondaryMenuItems(action: SmartActionInfo): SmartMenuItem[] {
  switch (action.kind) {
    case "link":
      return [
        { id: "copy-clean-url", label: "Copy tracking-free URL" },
        { id: "make-qr", label: "Make QR code" },
      ];
    case "email":
      return [{ id: "copy-address", label: "Copy address" }];
    case "phone":
      return [
        { id: "facetime-audio", label: "FaceTime Audio" },
        { id: "message", label: "Message" },
      ];
    case "color":
      return [
        { id: "copy-rgb", label: "Copy rgb()" },
        { id: "copy-swiftui", label: "Copy SwiftUI Color" },
      ];
    case "math":
      return [{ id: "paste-result", label: "Paste result" }];
    case "json":
      return [
        { id: "minify", label: "Minify" },
        { id: "paste-formatted", label: "Paste formatted" },
      ];
    case "address":
      return [];
    default: {
      return action satisfies never;
    }
  }
}

/** Primary + secondaries for Raycast/Alfred-style overflow (context menu / action panel). */
export function smartContextMenuItems(action: SmartActionInfo): SmartMenuItem[] {
  return [
    { id: "smart-primary", label: smartPrimaryActionLabel(action) },
    ...smartSecondaryMenuItems(action),
  ];
}

export function smartPrimaryActionLabel(action: SmartActionInfo): string {
  switch (action.kind) {
    case "link":
      return "Open link";
    case "email":
      return "Compose email";
    case "phone":
      return "FaceTime";
    case "address":
      return "Open in Maps";
    case "color":
      return "Copy HEX";
    case "math":
      return "Copy result";
    case "json":
      return "Format JSON";
    default: {
      return action satisfies never;
    }
  }
}

export function phoneDialUrl(number: string): string {
  const digits = number.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : digits.replace(/\D/g, "");
}
