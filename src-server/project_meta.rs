use std::collections::HashMap;
use std::path::Path;

use crate::models::{normalize_note_color_id, normalize_note_icon_id, ProjectAppearance};

pub const PROJECT_META_FILE: &str = ".notika-projects.json";

/// Update payload for project appearance properties.
/// - `None` means leave existing property unchanged (undefined).
/// - `Some(None)` means clear property (null).
/// - `Some(Some(val))` means set property to new value.
#[derive(Debug, Clone, Default)]
pub struct ProjectAppearanceUpdate {
    pub icon: Option<Option<String>>,
    pub color: Option<Option<String>>,
}

impl ProjectAppearanceUpdate {
    pub fn new(icon: Option<Option<String>>, color: Option<Option<String>>) -> Self {
        Self { icon, color }
    }
}

impl From<ProjectAppearance> for ProjectAppearanceUpdate {
    fn from(p: ProjectAppearance) -> Self {
        Self {
            icon: Some(p.icon),
            color: Some(p.color),
        }
    }
}

impl From<(Option<Option<String>>, Option<Option<String>>)> for ProjectAppearanceUpdate {
    fn from((icon, color): (Option<Option<String>>, Option<Option<String>>)) -> Self {
        Self { icon, color }
    }
}

impl From<(Option<String>, Option<String>)> for ProjectAppearanceUpdate {
    fn from((icon, color): (Option<String>, Option<String>)) -> Self {
        Self {
            icon: Some(icon),
            color: Some(color),
        }
    }
}

impl From<(Option<&str>, Option<&str>)> for ProjectAppearanceUpdate {
    fn from((icon, color): (Option<&str>, Option<&str>)) -> Self {
        Self {
            icon: Some(icon.map(|s| s.to_string())),
            color: Some(color.map(|s| s.to_string())),
        }
    }
}

/// Reads the project appearance map from `.notika-projects.json` in the given data directory.
/// Returns an empty map if the file does not exist or cannot be parsed.
pub async fn read_project_appearance_map(data_dir: &Path) -> HashMap<String, ProjectAppearance> {
    let file_path = data_dir.join(PROJECT_META_FILE);
    let raw = match tokio::fs::read_to_string(&file_path).await {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return HashMap::new(),
    };

    let obj = match parsed.as_object() {
        Some(o) => o,
        None => return HashMap::new(),
    };

    let mut map = HashMap::new();
    for (project_name, entry) in obj {
        if let Some(entry_obj) = entry.as_object() {
            let icon = entry_obj
                .get("icon")
                .and_then(|v| v.as_str())
                .and_then(normalize_note_icon_id);
            let color = entry_obj
                .get("color")
                .and_then(|v| v.as_str())
                .and_then(normalize_note_color_id);

            if icon.is_some() || color.is_some() {
                map.insert(project_name.clone(), ProjectAppearance { icon, color });
            }
        }
    }
    map
}

/// Writes the project appearance map to `.notika-projects.json` in the given data directory.
pub async fn write_project_appearance_map(
    data_dir: &Path,
    map: &HashMap<String, ProjectAppearance>,
) {
    let file_path = data_dir.join(PROJECT_META_FILE);
    if let Ok(json_str) = serde_json::to_string_pretty(map) {
        let _ = tokio::fs::create_dir_all(data_dir).await;
        let _ = tokio::fs::write(&file_path, json_str).await;
    }
}

/// Sets or updates the appearance (icon and/or color) of a project.
/// If both icon and color are cleared, removes the project entry from `.notika-projects.json`.
pub async fn set_project_appearance(
    data_dir: &Path,
    project_name: &str,
    appearance: impl Into<ProjectAppearanceUpdate>,
) -> ProjectAppearance {
    let mut map = read_project_appearance_map(data_dir).await;
    let existing = map.get(project_name).cloned().unwrap_or_default();
    let update = appearance.into();

    let next_icon = match update.icon {
        None => existing.icon,
        Some(None) => None,
        Some(Some(raw)) => normalize_note_icon_id(&raw),
    };

    let next_color = match update.color {
        None => existing.color,
        Some(None) => None,
        Some(Some(raw)) => normalize_note_color_id(&raw),
    };

    if next_icon.is_none() && next_color.is_none() {
        if map.contains_key(project_name) {
            map.remove(project_name);
            write_project_appearance_map(data_dir, &map).await;
        }
        return ProjectAppearance::default();
    }

    let next = ProjectAppearance {
        icon: next_icon,
        color: next_color,
    };
    map.insert(project_name.to_string(), next.clone());
    write_project_appearance_map(data_dir, &map).await;
    next
}

/// Relocates the appearance metadata when a project is renamed.
pub async fn relocate_project_appearance(
    data_dir: &Path,
    old_name: &str,
    new_name: &str,
) {
    if old_name == new_name {
        return;
    }
    let mut map = read_project_appearance_map(data_dir).await;
    if let Some(appearance) = map.remove(old_name) {
        map.insert(new_name.to_string(), appearance);
        write_project_appearance_map(data_dir, &map).await;
    }
}

/// Removes and returns the appearance metadata for a project (used when moving to trash).
pub async fn take_project_appearance(
    data_dir: &Path,
    project_name: &str,
) -> Option<ProjectAppearance> {
    let mut map = read_project_appearance_map(data_dir).await;
    let appearance = map.remove(project_name)?;
    write_project_appearance_map(data_dir, &map).await;
    Some(appearance)
}

/// Restores the appearance metadata for a project (used when restoring from trash).
pub async fn restore_project_appearance(
    data_dir: &Path,
    project_name: &str,
    appearance: ProjectAppearance,
) {
    let icon = appearance.icon.as_deref().and_then(normalize_note_icon_id);
    let color = appearance.color.as_deref().and_then(normalize_note_color_id);
    if icon.is_none() && color.is_none() {
        return;
    }

    let mut map = read_project_appearance_map(data_dir).await;
    map.insert(project_name.to_string(), ProjectAppearance { icon, color });
    write_project_appearance_map(data_dir, &map).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_empty_map() {
        let temp = tempdir().unwrap();
        let map = read_project_appearance_map(temp.path()).await;
        assert!(map.is_empty());
    }

    #[tokio::test]
    async fn test_set_and_read_appearance() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        let app = set_project_appearance(dir, "Work", (Some("star"), Some("rose"))).await;
        assert_eq!(app.icon, Some("star".to_string()));
        assert_eq!(app.color, Some("rose".to_string()));

        let map = read_project_appearance_map(dir).await;
        assert_eq!(map.len(), 1);
        let entry = map.get("Work").unwrap();
        assert_eq!(entry.icon, Some("star".to_string()));
        assert_eq!(entry.color, Some("rose".to_string()));
    }

    #[tokio::test]
    async fn test_partial_update_and_clear() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        set_project_appearance(dir, "Work", (Some("star"), Some("rose"))).await;

        // Partial update: update color, keep icon
        let updated = set_project_appearance(
            dir,
            "Work",
            ProjectAppearanceUpdate {
                icon: None,
                color: Some(Some("emerald".to_string())),
            },
        )
        .await;
        assert_eq!(updated.icon, Some("star".to_string()));
        assert_eq!(updated.color, Some("emerald".to_string()));

        // Clear both
        let cleared = set_project_appearance(
            dir,
            "Work",
            ProjectAppearanceUpdate {
                icon: Some(None),
                color: Some(None),
            },
        )
        .await;
        assert_eq!(cleared.icon, None);
        assert_eq!(cleared.color, None);

        let map = read_project_appearance_map(dir).await;
        assert!(!map.contains_key("Work"));
    }

    #[tokio::test]
    async fn test_relocate_appearance() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        set_project_appearance(dir, "OldProject", (Some("flame"), Some("amber"))).await;
        relocate_project_appearance(dir, "OldProject", "NewProject").await;

        let map = read_project_appearance_map(dir).await;
        assert!(!map.contains_key("OldProject"));
        assert!(map.contains_key("NewProject"));
        let entry = map.get("NewProject").unwrap();
        assert_eq!(entry.icon, Some("flame".to_string()));
        assert_eq!(entry.color, Some("amber".to_string()));
    }

    #[tokio::test]
    async fn test_take_and_restore_appearance() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        set_project_appearance(dir, "ProjectX", (Some("book"), Some("sky"))).await;
        let taken = take_project_appearance(dir, "ProjectX").await;
        assert!(taken.is_some());
        let appearance = taken.unwrap();
        assert_eq!(appearance.icon, Some("book".to_string()));

        let map = read_project_appearance_map(dir).await;
        assert!(!map.contains_key("ProjectX"));

        restore_project_appearance(dir, "ProjectX", appearance).await;
        let map_restored = read_project_appearance_map(dir).await;
        assert!(map_restored.contains_key("ProjectX"));
    }
}
