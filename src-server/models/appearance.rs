use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub const NOTE_ICON_IDS: &[&str] = &[
    "file",
    "sparkles",
    "book",
    "code",
    "lightbulb",
    "check-square",
    "star",
    "heart",
    "rocket",
    "bookmark",
    "terminal",
    "calendar",
    "flame",
];

pub const NOTE_COLOR_IDS: &[&str] = &[
    "default", "emerald", "sky", "violet", "amber", "rose", "indigo", "orange", "teal",
];

pub type NoteIconId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NoteColorId {
    Default,
    Emerald,
    Sky,
    Violet,
    Amber,
    Rose,
    Indigo,
    Orange,
    Teal,
}

impl NoteColorId {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Emerald => "emerald",
            Self::Sky => "sky",
            Self::Violet => "violet",
            Self::Amber => "amber",
            Self::Rose => "rose",
            Self::Indigo => "indigo",
            Self::Orange => "orange",
            Self::Teal => "teal",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "default" => Some(Self::Default),
            "emerald" => Some(Self::Emerald),
            "sky" => Some(Self::Sky),
            "violet" => Some(Self::Violet),
            "amber" => Some(Self::Amber),
            "rose" => Some(Self::Rose),
            "indigo" => Some(Self::Indigo),
            "orange" => Some(Self::Orange),
            "teal" => Some(Self::Teal),
            _ => None,
        }
    }
}

impl std::fmt::Display for NoteColorId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl Serialize for NoteColorId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for NoteColorId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Self::from_str(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("Geçersiz NoteColorId: {}", s)))
    }
}

static EMOJI_CHAR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}|\u{20E3})").unwrap()
});

fn clean_control_chars(raw: &str) -> String {
    raw.chars()
        .filter(|&c| !c.is_ascii_control())
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn is_emoji_string(raw: &str) -> bool {
    let cleaned = clean_control_chars(raw);
    if cleaned.is_empty() || cleaned.len() > 24 {
        return false;
    }
    EMOJI_CHAR_REGEX.is_match(&cleaned)
}

pub fn extract_first_emoji(raw: &str) -> Option<String> {
    let cleaned = clean_control_chars(raw);
    if cleaned.is_empty() {
        return None;
    }

    if let Some(mat) = EMOJI_CHAR_REGEX.find(&cleaned) {
        let mut end = mat.end();
        let remainder = &cleaned[end..];
        for c in remainder.chars() {
            if c == '\u{FE0F}' || c == '\u{200D}' || ('\u{1F3FB}'..='\u{1F3FF}').contains(&c) {
                end += c.len_utf8();
            } else {
                break;
            }
        }
        Some(cleaned[..end.min(cleaned.len())].to_string())
    } else {
        None
    }
}

pub fn normalize_note_icon_id(raw: &str) -> Option<String> {
    let cleaned = clean_control_chars(raw);
    if cleaned.is_empty() {
        return None;
    }

    let lower = cleaned.to_lowercase();
    if lower == "default" || lower == "file" {
        return None;
    }

    if NOTE_ICON_IDS.contains(&lower.as_str()) {
        return Some(lower);
    }

    if is_emoji_string(&cleaned) {
        if let Some(first) = extract_first_emoji(&cleaned) {
            return Some(first);
        }
        let truncated: String = cleaned.chars().take(24).collect();
        return Some(truncated);
    }

    None
}

pub fn normalize_note_color_id(raw: &str) -> Option<String> {
    let cleaned = raw.trim().to_lowercase();
    if cleaned.is_empty() || cleaned == "default" {
        return None;
    }
    if NOTE_COLOR_IDS.contains(&cleaned.as_str()) {
        Some(cleaned)
    } else {
        None
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAppearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}
