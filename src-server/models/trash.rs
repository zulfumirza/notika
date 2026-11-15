use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAppearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub kind: String, // "note" | "project"
    pub name: String,
    pub title: String,
    pub project: String,
    pub deleted_at: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredTrashItem {
    pub id: String,
    pub kind: String, // "note" | "project"
    pub name: String,
    pub title: String,
    pub project: String,
    pub deleted_at: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock_hashes: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_appearance: Option<ProjectAppearance>,
}

impl StoredTrashItem {
    pub fn to_public_trash_item(&self) -> TrashItem {
        TrashItem {
            id: self.id.clone(),
            kind: self.kind.clone(),
            name: self.name.clone(),
            title: self.title.clone(),
            project: self.project.clone(),
            deleted_at: self.deleted_at.clone(),
            size: self.size,
            note_count: self.note_count,
        }
    }
}

impl From<StoredTrashItem> for TrashItem {
    fn from(stored: StoredTrashItem) -> Self {
        stored.to_public_trash_item()
    }
}
