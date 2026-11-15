use super::appearance::{normalize_note_color_id, normalize_note_icon_id};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FrontmatterValue {
    Text(String),
    Number(f64),
    Boolean(bool),
    List(Vec<String>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrontmatterPropertyKind {
    Text,
    Date,
    Number,
    Boolean,
    List,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontmatterProperty {
    pub key: String,
    pub value: FrontmatterValue,
    pub kind: FrontmatterPropertyKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedFrontmatter {
    pub has_frontmatter: bool,
    pub raw_block: String,
    pub separator: String,
    pub properties: Vec<FrontmatterProperty>,
    pub extra_raw_lines: Vec<String>,
    pub body: String,
}

static DATE_VALUE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$").unwrap()
});

static PURE_NUMBER_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?$").unwrap()
});

static KEY_MATCH_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^([A-Za-z0-9_.\-\u{00C0}-\u{024F} ]+?):(?:\s+(.*))?$").unwrap()
});

static LIST_ITEM_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\s+-\s+(.*)$").unwrap()
});

static NESTED_LINE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\s+\S").unwrap()
});

static YAML_SPECIAL_START_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"^[-?:[\]{}#&*!|>'"%@`]"#).unwrap()
});

fn strip_quotes(raw: &str) -> (String, bool) {
    let trimmed = raw.trim();
    if trimmed.len() >= 2 {
        if trimmed.starts_with('"') && trimmed.ends_with('"') {
            let inner = &trimmed[1..trimmed.len() - 1];
            let unescaped = inner.replace(r#"\""#, "\"").replace(r#"\\"#, r#"\"#);
            return (unescaped, true);
        }
        if trimmed.starts_with('\'') && trimmed.ends_with('\'') {
            let inner = &trimmed[1..trimmed.len() - 1];
            let unescaped = inner.replace("''", "'");
            return (unescaped, true);
        }
    }
    (trimmed.to_string(), false)
}

fn parse_inline_array(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return Vec::new();
    }
    let inner = trimmed[1..trimmed.len() - 1].trim();
    if inner.is_empty() {
        return Vec::new();
    }

    let mut items = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let chars: Vec<char> = inner.chars().collect();

    for i in 0..chars.len() {
        let ch = chars[i];
        if let Some(q) = quote {
            if ch == q && (i == 0 || chars[i - 1] != '\\') {
                quote = None;
            }
            current.push(ch);
            continue;
        }

        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            current.push(ch);
            continue;
        }

        if ch == ',' {
            let (cleaned, _) = strip_quotes(&current);
            if !cleaned.is_empty() {
                items.push(cleaned);
            }
            current.clear();
            continue;
        }

        current.push(ch);
    }

    let (tail, _) = strip_quotes(&current);
    if !tail.is_empty() {
        items.push(tail);
    }

    items
}

fn is_date_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower == "date"
        || lower == "created"
        || lower == "updated"
        || lower == "tarih"
        || lower.ends_with("_date")
        || lower.ends_with("-date")
        || lower.ends_with("at")
}

fn is_list_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower == "tags"
        || lower == "tag"
        || lower == "aliases"
        || lower == "categories"
        || lower == "keywords"
}

fn parse_scalar(key: &str, raw_val: &str) -> (FrontmatterValue, FrontmatterPropertyKind) {
    let trimmed = raw_val.trim();

    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return (
            FrontmatterValue::List(parse_inline_array(trimmed)),
            FrontmatterPropertyKind::List,
        );
    }

    let (unquoted, was_quoted) = strip_quotes(trimmed);

    if !was_quoted {
        if unquoted.eq_ignore_ascii_case("true") {
            return (FrontmatterValue::Boolean(true), FrontmatterPropertyKind::Boolean);
        }
        if unquoted.eq_ignore_ascii_case("false") {
            return (FrontmatterValue::Boolean(false), FrontmatterPropertyKind::Boolean);
        }
        if PURE_NUMBER_REGEX.is_match(&unquoted) {
            if let Ok(num) = unquoted.parse::<f64>() {
                if num.is_finite() {
                    return (FrontmatterValue::Number(num), FrontmatterPropertyKind::Number);
                }
            }
        }
    }

    if DATE_VALUE_REGEX.is_match(&unquoted) || (is_date_key(key) && !unquoted.is_empty()) {
        return (FrontmatterValue::Text(unquoted), FrontmatterPropertyKind::Date);
    }

    if is_list_key(key) {
        let split: Vec<String> = unquoted
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return (FrontmatterValue::List(split), FrontmatterPropertyKind::List);
    }

    (FrontmatterValue::Text(unquoted), FrontmatterPropertyKind::Text)
}

pub fn parse_frontmatter(raw_markdown: &str) -> ParsedFrontmatter {
    let normalized = if raw_markdown.starts_with('\u{FEFF}') {
        &raw_markdown[3..]
    } else {
        raw_markdown
    };

    let lines: Vec<&str> = normalized.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    if lines.len() < 2 || lines[0].trim() != "---" {
        return ParsedFrontmatter {
            has_frontmatter: false,
            raw_block: String::new(),
            separator: String::new(),
            properties: Vec::new(),
            extra_raw_lines: Vec::new(),
            body: normalized.to_string(),
        };
    }

    let mut closing_index = None;
    for i in 1..lines.len() {
        let trimmed = lines[i].trim();
        if trimmed == "---" || trimmed == "..." {
            closing_index = Some(i);
            break;
        }
    }

    let closing_index = match closing_index {
        Some(idx) => idx,
        None => {
            return ParsedFrontmatter {
                has_frontmatter: false,
                raw_block: String::new(),
                separator: String::new(),
                properties: Vec::new(),
                extra_raw_lines: Vec::new(),
                body: normalized.to_string(),
            };
        }
    };

    let eol = if raw_markdown.contains("\r\n") { "\r\n" } else { "\n" };
    let frontmatter_lines = &lines[1..closing_index];
    let raw_block = lines[..=closing_index].join(eol) + eol;

    let remaining_lines = &lines[closing_index + 1..];
    let mut separator = String::new();
    let mut body_start = 0;
    if !remaining_lines.is_empty() && remaining_lines[0].trim().is_empty() {
        separator = eol.to_string();
        body_start = 1;
    }
    let body = remaining_lines[body_start..].join(eol);

    let mut properties: Vec<FrontmatterProperty> = Vec::new();
    let mut extra_raw_lines: Vec<String> = Vec::new();

    let mut i = 0;
    while i < frontmatter_lines.len() {
        let line = frontmatter_lines[i];
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            if trimmed.starts_with('#') {
                extra_raw_lines.push(line.to_string());
            }
            i += 1;
            continue;
        }

        let key_match = KEY_MATCH_REGEX.captures(line);
        if key_match.is_none() || line.starts_with(' ') || line.starts_with('\t') {
            extra_raw_lines.push(line.to_string());
            i += 1;
            continue;
        }

        let caps = key_match.unwrap();
        let key = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("").to_string();
        let rest = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");

        if rest.is_empty() {
            let mut list_items: Vec<String> = Vec::new();
            let mut nested_lines: Vec<String> = Vec::new();
            let mut j = i + 1;
            while j < frontmatter_lines.len() {
                let next_line = frontmatter_lines[j];
                if let Some(list_cap) = LIST_ITEM_REGEX.captures(next_line) {
                    let item_raw = list_cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    let (stripped, _) = strip_quotes(item_raw);
                    list_items.push(stripped);
                    j += 1;
                    continue;
                }
                if NESTED_LINE_REGEX.is_match(next_line) {
                    nested_lines.push(next_line.to_string());
                    j += 1;
                    continue;
                }
                break;
            }

            if !list_items.is_empty() && nested_lines.is_empty() {
                let filtered: Vec<String> = list_items
                    .into_iter()
                    .filter(|item| !item.is_empty())
                    .collect();
                properties.push(FrontmatterProperty {
                    key,
                    value: FrontmatterValue::List(filtered),
                    kind: FrontmatterPropertyKind::List,
                });
                i = j;
                continue;
            }

            if !nested_lines.is_empty() {
                extra_raw_lines.push(line.to_string());
                for nl in nested_lines {
                    extra_raw_lines.push(nl);
                }
                i = j;
                continue;
            }

            let is_list = is_list_key(&key);
            let is_date = is_date_key(&key);
            properties.push(FrontmatterProperty {
                key,
                value: if is_list {
                    FrontmatterValue::List(Vec::new())
                } else {
                    FrontmatterValue::Text(String::new())
                },
                kind: if is_list {
                    FrontmatterPropertyKind::List
                } else if is_date {
                    FrontmatterPropertyKind::Date
                } else {
                    FrontmatterPropertyKind::Text
                },
            });
            i += 1;
            continue;
        }

        let (value, kind) = parse_scalar(&key, rest);
        properties.push(FrontmatterProperty { key, value, kind });
        i += 1;
    }

    ParsedFrontmatter {
        has_frontmatter: true,
        raw_block,
        separator,
        properties,
        extra_raw_lines,
        body,
    }
}

fn needs_yaml_quotes(s: &str) -> bool {
    if s.is_empty() {
        return true;
    }
    if s != s.trim() {
        return true;
    }
    if s == "true" || s == "false" || s == "null" || s == "~" || PURE_NUMBER_REGEX.is_match(s) {
        return true;
    }
    if YAML_SPECIAL_START_REGEX.is_match(s) {
        return true;
    }
    if s.contains(": ") || s.contains(" #") || s.contains('\n') {
        return true;
    }
    false
}

fn format_yaml_string(s: &str) -> String {
    if !needs_yaml_quotes(s) {
        return s.to_string();
    }
    let escaped = s.replace('\\', r#"\\"#).replace('"', r#"\""#);
    format!(r#""{}""#, escaped)
}

pub fn serialize_frontmatter_block(
    properties: &[FrontmatterProperty],
    extra_raw_lines: &[String],
    eol: &str,
) -> String {
    if properties.is_empty() && extra_raw_lines.is_empty() {
        return String::new();
    }

    let mut out: Vec<String> = vec!["---".to_string()];

    for prop in properties {
        let safe_key = prop
            .key
            .chars()
            .filter(|&c| c != '\r' && c != '\n' && c != ':')
            .collect::<String>()
            .trim()
            .to_string();
        if safe_key.is_empty() {
            continue;
        }

        match &prop.value {
            FrontmatterValue::List(list) => {
                if list.is_empty() {
                    out.push(format!("{}: []", safe_key));
                } else {
                    out.push(format!("{}:", safe_key));
                    for item in list {
                        let clean = item.trim();
                        if !clean.is_empty() {
                            out.push(format!("  - {}", format_yaml_string(clean)));
                        }
                    }
                }
            }
            FrontmatterValue::Boolean(b) => {
                out.push(format!("{}: {}", safe_key, if *b { "true" } else { "false" }));
            }
            FrontmatterValue::Number(num) => {
                let formatted = if num.is_finite() {
                    if num.fract() == 0.0 {
                        format!("{}", *num as i64)
                    } else {
                        format!("{}", num)
                    }
                } else {
                    "0".to_string()
                };
                out.push(format!("{}: {}", safe_key, formatted));
            }
            FrontmatterValue::Text(text) => {
                if prop.kind == FrontmatterPropertyKind::Date && DATE_VALUE_REGEX.is_match(text.trim()) {
                    out.push(format!("{}: {}", safe_key, text.trim()));
                } else {
                    out.push(format!("{}: {}", safe_key, format_yaml_string(text)));
                }
            }
        }
    }

    for raw_line in extra_raw_lines {
        out.push(raw_line.clone());
    }

    out.push("---".to_string());
    out.join(eol) + eol
}

pub fn replace_frontmatter_body(full_markdown: &str, next_body: &str) -> String {
    let parsed = parse_frontmatter(full_markdown);
    if !parsed.has_frontmatter {
        return next_body.to_string();
    }

    let eol = if full_markdown.contains("\r\n") { "\r\n" } else { "\n" };
    let cleaned_body = next_body.trim_start_matches(|c| c == '\r' || c == '\n');
    if cleaned_body.is_empty() {
        return parsed.raw_block;
    }

    let sep = if !parsed.separator.is_empty() {
        &parsed.separator
    } else {
        eol
    };

    format!("{}{}{}", parsed.raw_block, sep, cleaned_body)
}

pub fn update_frontmatter_properties(
    full_markdown: &str,
    next_properties: &[FrontmatterProperty],
) -> String {
    let parsed = parse_frontmatter(full_markdown);
    let eol = if full_markdown.contains("\r\n") { "\r\n" } else { "\n" };

    let block = serialize_frontmatter_block(
        next_properties,
        &parsed.extra_raw_lines,
        eol,
    );

    let cleaned_body = parsed.body.trim_start_matches(|c| c == '\r' || c == '\n');

    if block.is_empty() {
        return cleaned_body.to_string();
    }

    if cleaned_body.is_empty() {
        return block;
    }

    let sep = if !parsed.separator.is_empty() {
        &parsed.separator
    } else {
        eol
    };

    format!("{}{}{}", block, sep, cleaned_body)
}

pub fn extract_tags_from_markdown(markdown: &str) -> Vec<String> {
    let parsed = parse_frontmatter(markdown);
    if !parsed.has_frontmatter {
        return Vec::new();
    }

    let tag_prop = parsed.properties.iter().find(|p| {
        let k = p.key.to_lowercase();
        k == "tags" || k == "tag"
    });

    let tag_prop = match tag_prop {
        Some(p) => p,
        None => return Vec::new(),
    };

    match &tag_prop.value {
        FrontmatterValue::List(list) => list
            .iter()
            .map(|t| t.trim_start_matches('#').trim().to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        FrontmatterValue::Text(text) => text
            .split(',')
            .map(|t| t.trim_start_matches('#').trim().to_string())
            .filter(|t| !t.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

pub fn is_frontmatter_pinned(markdown: &str) -> bool {
    let parsed = parse_frontmatter(markdown);
    if !parsed.has_frontmatter {
        return false;
    }
    let pinned_prop = parsed
        .properties
        .iter()
        .find(|p| p.key.to_lowercase() == "pinned");
    match pinned_prop {
        Some(p) => match &p.value {
            FrontmatterValue::Boolean(b) => *b,
            FrontmatterValue::Text(s) => s.trim().eq_ignore_ascii_case("true"),
            _ => false,
        },
        None => false,
    }
}

pub fn set_frontmatter_pinned(markdown: &str, pinned: bool) -> String {
    let parsed = parse_frontmatter(markdown);
    let mut next_properties: Vec<FrontmatterProperty> = parsed
        .properties
        .into_iter()
        .filter(|p| p.key.to_lowercase() != "pinned")
        .collect();

    if pinned {
        next_properties.insert(
            0,
            FrontmatterProperty {
                key: "pinned".to_string(),
                value: FrontmatterValue::Boolean(true),
                kind: FrontmatterPropertyKind::Boolean,
            },
        );
    }

    update_frontmatter_properties(markdown, &next_properties)
}

pub fn extract_note_appearance(markdown: &str) -> (Option<String>, Option<String>) {
    let parsed = parse_frontmatter(markdown);
    if !parsed.has_frontmatter {
        return (None, None);
    }

    let icon_prop = parsed
        .properties
        .iter()
        .find(|p| p.key.to_lowercase() == "icon");
    let color_prop = parsed
        .properties
        .iter()
        .find(|p| p.key.to_lowercase() == "color");

    let icon = icon_prop.and_then(|p| match &p.value {
        FrontmatterValue::Text(s) => normalize_note_icon_id(s),
        _ => None,
    });

    let color = color_prop.and_then(|p| match &p.value {
        FrontmatterValue::Text(s) => normalize_note_color_id(s),
        _ => None,
    });

    (icon, color)
}

pub fn set_frontmatter_appearance(
    markdown: &str,
    icon: Option<&str>,
    color: Option<&str>,
) -> String {
    let parsed = parse_frontmatter(markdown);
    let next_icon = icon.and_then(normalize_note_icon_id);
    let next_color = color.and_then(normalize_note_color_id);

    let filtered: Vec<FrontmatterProperty> = parsed
        .properties
        .into_iter()
        .filter(|p| {
            let k = p.key.to_lowercase();
            k != "icon" && k != "color"
        })
        .collect();

    let mut extra_props: Vec<FrontmatterProperty> = Vec::new();
    if let Some(ic) = next_icon {
        extra_props.push(FrontmatterProperty {
            key: "icon".to_string(),
            value: FrontmatterValue::Text(ic),
            kind: FrontmatterPropertyKind::Text,
        });
    }
    if let Some(col) = next_color {
        extra_props.push(FrontmatterProperty {
            key: "color".to_string(),
            value: FrontmatterValue::Text(col),
            kind: FrontmatterPropertyKind::Text,
        });
    }

    extra_props.extend(filtered);
    update_frontmatter_properties(markdown, &extra_props)
}

pub fn patch_frontmatter_appearance(
    markdown: &str,
    icon: Option<Option<&str>>,
    color: Option<Option<&str>>,
) -> String {
    let (curr_icon, curr_color) = extract_note_appearance(markdown);
    let target_icon = match icon {
        Some(opt) => opt.and_then(normalize_note_icon_id),
        None => curr_icon,
    };
    let target_color = match color {
        Some(opt) => opt.and_then(normalize_note_color_id),
        None => curr_color,
    };
    set_frontmatter_appearance(markdown, target_icon.as_deref(), target_color.as_deref())
}
