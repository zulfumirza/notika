use serde::{Deserialize, Serialize};

pub type SharePermission = String; // "read" | "edit"
pub type ShareKind = String; // "link" | "invite"

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareRecord {
    pub code: String,
    pub project: String,
    pub note: String,
    pub permission: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invitee_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invitee_email: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredShareRecord {
    pub code: String,
    pub project: String,
    pub note: String,
    pub permission: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invitee_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invitee_email: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSharedNote {
    pub code: String,
    pub project: String,
    pub note: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
    pub permission: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invitee_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires_password: Option<bool>,
}

impl StoredShareRecord {
    pub fn to_share_record(&self) -> ShareRecord {
        ShareRecord {
            code: self.code.clone(),
            project: self.project.clone(),
            note: self.note.clone(),
            permission: self.permission.clone(),
            kind: self.kind.clone(),
            invitee_name: self.invitee_name.clone(),
            invitee_email: self.invitee_email.clone(),
            created_at: self.created_at.clone(),
            expires_at: self.expires_at.clone(),
            has_password: if self.password_hash.is_some() {
                Some(true)
            } else {
                None
            },
        }
    }
}

impl From<StoredShareRecord> for ShareRecord {
    fn from(stored: StoredShareRecord) -> Self {
        stored.to_share_record()
    }
}
