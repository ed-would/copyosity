use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmartKind {
    Link,
    Email,
    Phone,
    Address,
}

impl SmartKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SmartKind::Link => "link",
            SmartKind::Email => "email",
            SmartKind::Phone => "phone",
            SmartKind::Address => "address",
        }
    }
}

pub struct SmartMatch {
    pub kind: SmartKind,
    pub value: String,
}

/// Only tag a card when a single detected match dominates the whole
/// (trimmed) text, so a paragraph that merely *mentions* a phone number
/// doesn't get miscategorized as a "Phone" card.
const DOMINANCE_RATIO: f64 = 0.85;
const MAX_DETECT_LEN: usize = 2000;

/// Extract a UTF-16 `NSRange` substring from Rust text (NSDataDetector ranges are UTF-16).
pub fn utf16_substring(text: &str, location: usize, length: usize) -> Option<String> {
    let utf16: Vec<u16> = text.encode_utf16().collect();
    let end = location.saturating_add(length);
    let slice = utf16.get(location..end)?;
    String::from_utf16(slice).ok()
}

#[cfg(target_os = "macos")]
fn data_detector() -> Option<&'static objc2::rc::Retained<objc2_foundation::NSDataDetector>> {
    use objc2::rc::Retained;
    use objc2_foundation::{NSDataDetector, NSTextCheckingType};

    static DETECTOR: OnceLock<Option<Retained<NSDataDetector>>> = OnceLock::new();
    DETECTOR
        .get_or_init(|| {
            let checking_types = NSTextCheckingType::Link.0
                | NSTextCheckingType::PhoneNumber.0
                | NSTextCheckingType::Address.0;
            NSDataDetector::dataDetectorWithTypes_error(checking_types).ok()
        })
        .as_ref()
}

#[cfg(target_os = "macos")]
pub fn detect(text: &str) -> Option<SmartMatch> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_DETECT_LEN {
        return None;
    }

    use objc2_foundation::{NSMatchingOptions, NSRange, NSString, NSTextCheckingType};

    let detector = data_detector()?;
    let ns_text = NSString::from_str(trimmed);
    // NSRange uses UTF-16 code units, not UTF-8 bytes.
    let full_range = NSRange {
        location: 0,
        length: ns_text.length(),
    };
    let matches =
        detector.matchesInString_options_range(&ns_text, NSMatchingOptions::empty(), full_range);

    let dominant = matches.iter().max_by_key(|m| m.range().length)?;
    if (dominant.range().length as f64) < (full_range.length as f64) * DOMINANCE_RATIO {
        return None;
    }

    match dominant.resultType() {
        t if t == NSTextCheckingType::Link => {
            let url = dominant.URL()?;
            let absolute = url.absoluteString()?.to_string();
            if absolute.starts_with("mailto:") {
                Some(SmartMatch {
                    kind: SmartKind::Email,
                    value: absolute.trim_start_matches("mailto:").to_owned(),
                })
            } else {
                Some(SmartMatch {
                    kind: SmartKind::Link,
                    value: absolute,
                })
            }
        }
        t if t == NSTextCheckingType::PhoneNumber => {
            let phone = dominant.phoneNumber()?;
            Some(SmartMatch {
                kind: SmartKind::Phone,
                value: phone.to_string(),
            })
        }
        t if t == NSTextCheckingType::Address => {
            let range = dominant.range();
            let value = utf16_substring(trimmed, range.location as usize, range.length as usize)?;
            Some(SmartMatch {
                kind: SmartKind::Address,
                value,
            })
        }
        _ => None,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn detect(_text: &str) -> Option<SmartMatch> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_substring_round_trips_cyrillic() {
        let text = "Улица Пушкина, дом Колотушкина, 1";
        let needle = "Пушкина";
        let utf16: Vec<u16> = text.encode_utf16().collect();
        let needle_utf16: Vec<u16> = needle.encode_utf16().collect();
        let location = utf16
            .windows(needle_utf16.len())
            .position(|w| w == needle_utf16.as_slice())
            .expect("needle");
        let value = utf16_substring(text, location, needle_utf16.len()).expect("slice");
        assert_eq!(value, needle);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn phone_only_string_matches() {
        let result = detect("(415) 555-2671").expect("phone");
        assert_eq!(result.kind, SmartKind::Phone);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn phone_embedded_in_sentence_does_not_match() {
        assert!(detect("Call me at (415) 555-2671 tomorrow").is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn email_matches() {
        let result = detect("john@example.com").expect("email");
        assert_eq!(result.kind, SmartKind::Email);
        assert_eq!(result.value, "john@example.com");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn link_matches() {
        let result = detect("https://example.com/page?utm_source=x").expect("link");
        assert_eq!(result.kind, SmartKind::Link);
        assert!(result.value.contains("example.com"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn empty_and_long_text_do_not_match() {
        assert!(detect("").is_none());
        assert!(detect(&"a".repeat(MAX_DETECT_LEN + 1)).is_none());
    }
}
