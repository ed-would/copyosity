//! Demo clipboard entries for manual QA of Smart Actions, Quick Look, and related overlay features.
//! Entries use `content_hash` values prefixed with `demo:` so they can be replaced idempotently.

use base64::Engine;
use chrono::{Duration, Utc};
use image::{ImageBuffer, ImageFormat, Luma};
use std::io::Cursor;

use crate::db::{ClipboardEntry, Database};

pub const DEMO_HASH_PREFIX: &str = "demo:";

const TINY_PNG_B64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/// Minimal animated GIF (1×1).
const TINY_GIF_B64: &str = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

struct DemoTextSpec {
    key: &'static str,
    text: String,
    source_app: &'static str,
    pinned: bool,
}

struct DemoImageSpec {
    key: &'static str,
    format: &'static str,
    image_b64: String,
    width: i64,
    height: i64,
    byte_size: i64,
    source_app: &'static str,
    ocr_text: Option<&'static str>,
    pinned: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct DemoSeedReport {
    pub removed: u32,
    pub inserted: u32,
}

pub fn seed(db: &Database) -> Result<DemoSeedReport, String> {
    let removed = db
        .delete_entries_by_content_hash_prefix(DEMO_HASH_PREFIX)
        .map_err(|e| e.to_string())?;

    let (wide_png_b64, wide_w, wide_h, wide_bytes) = make_gradient_png_b64(320, 200);

    let text_specs = demo_text_specs();
    let image_specs = demo_image_specs(&wide_png_b64, wide_w, wide_h, wide_bytes);

    let total = text_specs.len() + image_specs.len();
    let base_time = Utc::now();

    for (index, spec) in text_specs.iter().enumerate() {
        let created_at = (base_time - Duration::minutes(index as i64)).to_rfc3339();
        let text = spec.text.clone();
        let entry = ClipboardEntry {
            id: 0,
            content_type: "text".to_string(),
            text_content: Some(text),
            image_data: None,
            image_thumb: None,
            source_app: Some(spec.source_app.to_string()),
            source_app_icon: None,
            content_hash: demo_hash(spec.key),
            char_count: Some(spec.text.len() as i64),
            created_at,
            is_pinned: spec.pinned,
            collection_id: None,
            tags: Vec::new(),
            ocr_text: None,
            image_format: None,
            image_width: None,
            image_height: None,
            image_byte_size: None,
        };
        db.insert_entry(&entry).map_err(|e| e.to_string())?;
    }

    for (offset, spec) in image_specs.iter().enumerate() {
        let index = text_specs.len() + offset;
        let created_at = (base_time - Duration::minutes(index as i64)).to_rfc3339();
        let entry = ClipboardEntry {
            id: 0,
            content_type: "image".to_string(),
            text_content: None,
            image_data: Some(spec.image_b64.clone()),
            image_thumb: Some(spec.image_b64.clone()),
            source_app: Some(spec.source_app.to_string()),
            source_app_icon: None,
            content_hash: demo_hash(spec.key),
            char_count: None,
            created_at,
            is_pinned: spec.pinned,
            collection_id: None,
            tags: vec![spec.format.to_lowercase()],
            ocr_text: None,
            image_format: Some(spec.format.to_string()),
            image_width: Some(spec.width),
            image_height: Some(spec.height),
            image_byte_size: Some(spec.byte_size),
        };
        let (id, _) = db.insert_entry(&entry).map_err(|e| e.to_string())?;
        if let Some(ocr) = spec.ocr_text {
            db.set_ocr_text(id, ocr).map_err(|e| e.to_string())?;
        }
    }

    Ok(DemoSeedReport {
        removed,
        inserted: total as u32,
    })
}

fn demo_hash(key: &str) -> String {
    format!("{DEMO_HASH_PREFIX}{key}")
}

fn make_gradient_png_b64(width: u32, height: u32) -> (String, i64, i64, i64) {
    let mut img: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::new(width, height);
    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let v = ((x.wrapping_add(y)) % 256) as u8;
        *pixel = Luma([v]);
    }
    let mut bytes = Vec::new();
    image::DynamicImage::ImageLuma8(img)
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("encode demo png");
    let byte_size = bytes.len() as i64;
    (
        base64::engine::general_purpose::STANDARD.encode(bytes),
        width as i64,
        height as i64,
        byte_size,
    )
}

fn demo_text_specs() -> Vec<DemoTextSpec> {
    fn txt(s: &str) -> String {
        s.to_string()
    }

    vec![
        // --- Smart Actions: Link ---
        DemoTextSpec {
            key: "link-tracking",
            text: txt(
                "https://github.com/copyosity/app?utm_source=twitter&fbclid=abc&gclid=xyz&id=42",
            ),
            source_app: "Chrome",
            pinned: false,
        },
        DemoTextSpec {
            key: "link-clean",
            text: txt("https://example.com/docs/smart-actions"),
            source_app: "Safari",
            pinned: false,
        },
        DemoTextSpec {
            key: "link-http",
            text: txt("http://localhost:1420/dev/smart-actions"),
            source_app: "Safari",
            pinned: true,
        },
        // --- Email ---
        DemoTextSpec {
            key: "email",
            text: txt("hello@copyosity.app"),
            source_app: "Mail",
            pinned: false,
        },
        DemoTextSpec {
            key: "email-long-domain",
            text: txt("jane.doe@company.example"),
            source_app: "Mail",
            pinned: false,
        },
        // --- Phone ---
        DemoTextSpec {
            key: "phone-intl",
            text: txt("+1 (415) 555-0199"),
            source_app: "Contacts",
            pinned: false,
        },
        DemoTextSpec {
            key: "phone-local",
            text: txt("(415) 555-2671"),
            source_app: "Phone",
            pinned: false,
        },
        // --- Address ---
        DemoTextSpec {
            key: "address-us",
            text: txt("1 Infinite Loop, Cupertino, CA 95014"),
            source_app: "Maps",
            pinned: false,
        },
        DemoTextSpec {
            key: "address-short",
            text: txt("350 Fifth Avenue, New York, NY"),
            source_app: "Notes",
            pinned: false,
        },
        // --- Color ---
        DemoTextSpec {
            key: "color-hex",
            text: txt("#3A7BD5"),
            source_app: "Figma",
            pinned: false,
        },
        DemoTextSpec {
            key: "color-hex-short",
            text: txt("#fff"),
            source_app: "Figma",
            pinned: false,
        },
        DemoTextSpec {
            key: "color-rgb",
            text: txt("rgb(58, 123, 213)"),
            source_app: "Sketch",
            pinned: false,
        },
        DemoTextSpec {
            key: "color-rgba",
            text: txt("rgba(0, 0, 0, 0.5)"),
            source_app: "Sketch",
            pinned: false,
        },
        // --- Math ---
        DemoTextSpec {
            key: "math-basic",
            text: txt("18*24+7"),
            source_app: "Calculator",
            pinned: false,
        },
        DemoTextSpec {
            key: "math-parens",
            text: txt("(2+3)*4"),
            source_app: "Calculator",
            pinned: false,
        },
        DemoTextSpec {
            key: "math-power",
            text: txt("2^10"),
            source_app: "Calculator",
            pinned: false,
        },
        // --- JSON ---
        DemoTextSpec {
            key: "json-object",
            text: txt(r#"{"name":"Copyosity","version":"0.6.2","features":["smart","ql"]}"#),
            source_app: "VS Code",
            pinned: false,
        },
        DemoTextSpec {
            key: "json-array",
            text: txt(r#"[{"id":1,"ok":true},{"id":2,"ok":false}]"#),
            source_app: "VS Code",
            pinned: false,
        },
        // --- Negative / plain Text ---
        DemoTextSpec {
            key: "neg-phone-in-sentence",
            text: txt("Call me at (415) 555-1234 tomorrow — should stay Text, not Phone."),
            source_app: "Notes",
            pinned: false,
        },
        DemoTextSpec {
            key: "neg-hex-in-css",
            text: txt("color: #3A7BD5; background: rgb(0, 0, 0);"),
            source_app: "VS Code",
            pinned: false,
        },
        DemoTextSpec {
            key: "neg-plain",
            text: txt("Plain note without smart detection — baseline Text card."),
            source_app: "Notes",
            pinned: false,
        },
        DemoTextSpec {
            key: "neg-long-no-detect",
            text: "x".repeat(2100),
            source_app: "Notes",
            pinned: false,
        },
        // --- Quick Look: long text & code ---
        DemoTextSpec {
            key: "ql-long-text",
            text: txt(QUICK_LOOK_LONG_TEXT),
            source_app: "Notes",
            pinned: false,
        },
        DemoTextSpec {
            key: "ql-python",
            text: txt(QUICK_LOOK_PYTHON),
            source_app: "VS Code",
            pinned: false,
        },
        DemoTextSpec {
            key: "ql-rust",
            text: txt(QUICK_LOOK_RUST),
            source_app: "RustRover",
            pinned: false,
        },
    ]
}

fn demo_image_specs(
    wide_png_b64: &str,
    wide_w: i64,
    wide_h: i64,
    wide_bytes: i64,
) -> Vec<DemoImageSpec> {
    vec![
        DemoImageSpec {
            key: "ql-image-png",
            format: "PNG",
            image_b64: wide_png_b64.to_string(),
            width: wide_w,
            height: wide_h,
            byte_size: wide_bytes,
            source_app: "Preview",
            ocr_text: None,
            pinned: false,
        },
        DemoImageSpec {
            key: "ql-image-ocr",
            format: "PNG",
            image_b64: TINY_PNG_B64.to_string(),
            width: 1,
            height: 1,
            byte_size: 68,
            source_app: "Screenshot",
            ocr_text: Some(
                "Recognised text sample for Quick Look Image / Recognised text toggle.\nLine two of OCR preview.",
            ),
            pinned: false,
        },
        DemoImageSpec {
            key: "ql-image-gif",
            format: "GIF",
            image_b64: TINY_GIF_B64.to_string(),
            width: 1,
            height: 1,
            byte_size: 42,
            source_app: "Safari",
            ocr_text: None,
            pinned: false,
        },
    ]
}

const QUICK_LOOK_LONG_TEXT: &str = "\
Smart Actions and Quick Look demo — long text entry.

This paragraph exists to exercise scrollable Quick Look preview. \
Copy a real document to compare; this seed entry is intentionally verbose.

Section 2: bullet-style notes
- Link cards: Open, tracking-free URL, QR code
- Email: Compose, copy address
- Phone: FaceTime, Message
- Color: HEX, rgb(), SwiftUI Color(...)
- Math: copy or paste result
- JSON: format, minify, paste formatted

Section 3: filler for scroll testing. \
Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. \
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum. \
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.";

const QUICK_LOOK_PYTHON: &str = "\
def greet(name: str) -> str:
    return f\"Hello, {name}!\"

if __name__ == \"__main__\":
    print(greet(\"Copyosity\"))
";

const QUICK_LOOK_RUST: &str = "\
fn main() {
    let total: i64 = (2 + 3) * 4;
    println!(\"result = {total}\");
}
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn test_db() -> Database {
        let dir =
            std::env::temp_dir().join(format!("copyosity-demo-seed-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        Database::new(dir).expect("test database")
    }

    #[test]
    fn seed_is_idempotent_and_inserts_demo_entries() {
        let db = test_db();
        let first = seed(&db).unwrap();
        assert!(first.inserted > 20);
        assert_eq!(first.removed, 0);

        let second = seed(&db).unwrap();
        assert_eq!(second.removed, first.inserted);
        assert_eq!(second.inserted, first.inserted);
    }
}
