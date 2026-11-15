use std::collections::HashSet;
use std::path::Path;
use chrono::Utc;
use once_cell::sync::Lazy;
use rand::RngCore;
use regex::Regex;
use serde::Deserialize;

use crate::error::VaultError;
use crate::locks::{hash_password_secret, verify_password_secret};
use crate::models::{
    AppSettings, PublicSharedNote, ShareRecord, StoredShareRecord,
};

pub const SHARES_FILE: &str = ".notika-shares.json";
pub const SETTINGS_FILE: &str = ".notika-settings.json";
pub const SHORT_ALPHABET: &str = "abcdefghijkmnopqrstuvwxyz23456789";

static SHARE_CODE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9]{4,16}$").expect("Geçerli paylaşım kodu regexi")
});

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareInput {
    pub project: String,
    pub note: String,
    #[serde(default)]
    pub permission: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub invitee_name: Option<String>,
    #[serde(default)]
    pub invitee_email: Option<String>,
    #[serde(default)]
    pub expires_in_hours: Option<f64>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppSettingsInput {
    #[serde(default)]
    pub mcp_enabled: Option<bool>,
}

/// Generates a random short code from SHORT_ALPHABET
fn generate_short_code(length: usize) -> String {
    let chars = SHORT_ALPHABET.as_bytes();
    let mut bytes = vec![0u8; length];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
        .into_iter()
        .map(|b| {
            let idx = (b as usize) % chars.len();
            chars[idx] as char
        })
        .collect()
}

/// Generates an MCP token with prefix "ntk_" and 24 random hex bytes (48 hex chars)
pub fn generate_mcp_token() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("ntk_{}", hex::encode(bytes))
}

fn strip_ext(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".md") {
        file_name[..file_name.len() - 3].to_string()
    } else if lower.ends_with(".txt") {
        file_name[..file_name.len() - 4].to_string()
    } else {
        file_name.to_string()
    }
}

/// Reads all shares from `.notika-shares.json` and filters out expired shares
async fn read_all_shares(data_dir: &Path) -> Vec<StoredShareRecord> {
    let file_path = data_dir.join(SHARES_FILE);
    let raw = match tokio::fs::read_to_string(&file_path).await {
        Ok(content) => content,
        Err(_) => return Vec::new(),
    };

    let items: Vec<StoredShareRecord> = match serde_json::from_str(&raw) {
        Ok(records) => records,
        Err(_) => return Vec::new(),
    };

    let now_iso = Utc::now().to_rfc3339();
    items
        .into_iter()
        .filter(|item| {
            if let Some(exp) = &item.expires_at {
                if exp.as_str() <= now_iso.as_str() {
                    return false;
                }
            }
            true
        })
        .collect()
}

/// Writes all shares to `.notika-shares.json`
async fn write_all_shares(data_dir: &Path, shares: &[StoredShareRecord]) {
    let file_path = data_dir.join(SHARES_FILE);
    if let Ok(json_str) = serde_json::to_string_pretty(shares) {
        let _ = tokio::fs::create_dir_all(data_dir).await;
        let _ = tokio::fs::write(&file_path, json_str).await;
    }
}

/// Converts a StoredShareRecord to a public ShareRecord (hides passwordHash, sets hasPassword)
pub fn to_public_share_record(rec: &StoredShareRecord) -> ShareRecord {
    ShareRecord {
        code: rec.code.clone(),
        project: rec.project.clone(),
        note: rec.note.clone(),
        permission: rec.permission.clone(),
        kind: rec.kind.clone(),
        invitee_name: rec.invitee_name.clone(),
        invitee_email: rec.invitee_email.clone(),
        created_at: rec.created_at.clone(),
        expires_at: rec.expires_at.clone(),
        has_password: if rec.password_hash.is_some() {
            Some(true)
        } else {
            None
        },
    }
}

/// Lists all active shares for a specific note
pub async fn list_shares_for_note(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Result<Vec<ShareRecord>, VaultError> {
    let resolved = crate::vault::resolve_note_path(data_dir, project, note).await?;
    let all = read_all_shares(data_dir).await;
    let list = all
        .iter()
        .filter(|item| item.project == resolved.project_name && item.note == resolved.note_name)
        .map(to_public_share_record)
        .collect();
    Ok(list)
}

/// Creates a new share link or personal invite
pub async fn create_share_or_invite(
    data_dir: &Path,
    input: CreateShareInput,
) -> Result<ShareRecord, VaultError> {
    let resolved = crate::vault::resolve_note_path(data_dir, &input.project, &input.note).await?;

    // Verify note actually exists
    crate::vault::read_note(data_dir, &resolved.project_name, &resolved.note_name).await?;

    let permission = if input.permission.as_deref() == Some("edit") {
        "edit".to_string()
    } else {
        "read".to_string()
    };

    let kind = if input.kind.as_deref() == Some("invite") {
        "invite".to_string()
    } else {
        "link".to_string()
    };

    let invitee_name = input
        .invitee_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| {
            if s.chars().count() > 80 {
                s.chars().take(80).collect()
            } else {
                s
            }
        });

    let invitee_email = input
        .invitee_email
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| {
            if s.chars().count() > 120 {
                s.chars().take(120).collect()
            } else {
                s
            }
        });

    if kind == "invite" && invitee_name.is_none() && invitee_email.is_none() {
        return Err(VaultError::bad_request(
            "Davet edilecek kişinin adını veya e-posta adresini girin.",
        ));
    }

    let mut expires_at = None;
    if let Some(hours) = input.expires_in_hours {
        if hours.is_finite() && hours > 0.0 {
            let max_hours = hours.min(24.0 * 365.0);
            let ms = (max_hours * 3600.0 * 1000.0) as i64;
            let expiry_time = Utc::now() + chrono::Duration::milliseconds(ms);
            expires_at = Some(expiry_time.to_rfc3339());
        }
    }

    let password_hash = input
        .password
        .filter(|p| !p.is_empty())
        .map(|p| hash_password_secret(&p));

    let mut all = read_all_shares(data_dir).await;
    let mut code = generate_short_code(7);
    while all.iter().any(|s| s.code == code) {
        code = generate_short_code(7);
    }

    let record = StoredShareRecord {
        code,
        project: resolved.project_name,
        note: resolved.note_name,
        permission,
        kind,
        invitee_name,
        invitee_email,
        created_at: Utc::now().to_rfc3339(),
        expires_at,
        password_hash,
    };

    all.insert(0, record.clone());
    write_all_shares(data_dir, &all).await;
    Ok(to_public_share_record(&record))
}

/// Updates the permission level ('read' or 'edit') of an existing share
pub async fn update_share_permission(
    data_dir: &Path,
    code: &str,
    permission: &str,
) -> Result<ShareRecord, VaultError> {
    if !SHARE_CODE_REGEX.is_match(code) {
        return Err(VaultError::bad_request("Geçersiz paylaşım kodu."));
    }

    let next_permission = if permission == "edit" {
        "edit".to_string()
    } else {
        "read".to_string()
    };

    let mut all = read_all_shares(data_dir).await;
    let idx = all
        .iter()
        .position(|s| s.code == code)
        .ok_or_else(|| VaultError::not_found("Paylaşım bağlantısı bulunamadı."))?;

    all[idx].permission = next_permission;
    let updated = all[idx].clone();
    write_all_shares(data_dir, &all).await;
    Ok(to_public_share_record(&updated))
}

/// Revokes and deletes a share link by its code
pub async fn revoke_share(data_dir: &Path, code: &str) -> Result<(), VaultError> {
    if !SHARE_CODE_REGEX.is_match(code) {
        return Err(VaultError::bad_request("Geçersiz paylaşım kodu."));
    }

    let all = read_all_shares(data_dir).await;
    let len_before = all.len();
    let next: Vec<StoredShareRecord> = all.into_iter().filter(|s| s.code != code).collect();

    if next.len() == len_before {
        return Err(VaultError::not_found("Paylaşım bağlantısı bulunamadı."));
    }

    write_all_shares(data_dir, &next).await;
    Ok(())
}

/// Updates project and note references in shares when a note is renamed or moved
pub async fn relocate_share_note_references(
    data_dir: &Path,
    old_project: &str,
    old_note: &str,
    new_project: &str,
    new_note: &str,
) -> Result<(), VaultError> {
    if old_project == new_project && old_note == new_note {
        return Ok(());
    }

    let all = read_all_shares(data_dir).await;
    let mut changed = false;
    let next: Vec<StoredShareRecord> = all
        .into_iter()
        .map(|mut share| {
            if share.project == old_project && share.note == old_note {
                share.project = new_project.to_string();
                share.note = new_note.to_string();
                changed = true;
            }
            share
        })
        .collect();

    if changed {
        write_all_shares(data_dir, &next).await;
    }
    Ok(())
}

/// Updates project references in shares when a project is renamed
pub async fn relocate_share_project_references(
    data_dir: &Path,
    old_project: &str,
    new_project: &str,
) -> Result<(), VaultError> {
    if old_project == new_project {
        return Ok(());
    }

    let all = read_all_shares(data_dir).await;
    let mut changed = false;
    let next: Vec<StoredShareRecord> = all
        .into_iter()
        .map(|mut share| {
            if share.project == old_project {
                share.project = new_project.to_string();
                changed = true;
            }
            share
        })
        .collect();

    if changed {
        write_all_shares(data_dir, &next).await;
    }
    Ok(())
}

/// Deletes all shares associated with a note
pub async fn delete_shares_for_note(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Result<(), VaultError> {
    let all = read_all_shares(data_dir).await;
    let len_before = all.len();
    let next: Vec<StoredShareRecord> = all
        .into_iter()
        .filter(|s| !(s.project == project && s.note == note))
        .collect();

    if next.len() != len_before {
        write_all_shares(data_dir, &next).await;
    }
    Ok(())
}

/// Deletes all shares associated with a project
pub async fn delete_shares_for_project(
    data_dir: &Path,
    project: &str,
) -> Result<(), VaultError> {
    let all = read_all_shares(data_dir).await;
    let len_before = all.len();
    let next: Vec<StoredShareRecord> = all
        .into_iter()
        .filter(|s| s.project != project)
        .collect();

    if next.len() != len_before {
        write_all_shares(data_dir, &next).await;
    }
    Ok(())
}

/// Verifies whether the password provided for a password-protected share is correct
pub async fn verify_share_password(
    data_dir: &Path,
    code: &str,
    password: &str,
) -> Result<(), VaultError> {
    if !SHARE_CODE_REGEX.is_match(code) {
        return Err(VaultError::not_found("Geçersiz paylaşım bağlantısı."));
    }

    let all = read_all_shares(data_dir).await;
    let share = all
        .iter()
        .find(|s| s.code == code)
        .ok_or_else(|| {
            VaultError::not_found(
                "Bu paylaşım veya davet bağlantısı geçersiz ya da süresi dolmuş.",
            )
        })?;

    if let Some(hash) = &share.password_hash {
        if !verify_password_secret(password, hash) {
            return Err(VaultError::unauthorized("Paylaşım şifresi hatalı."));
        }
    }

    Ok(())
}

/// Resolves a shared note by its code. If password is required and not unlocked, returns placeholder
pub async fn resolve_shared_note(
    data_dir: &Path,
    code: &str,
    unlocked_codes: &HashSet<String>,
) -> Result<PublicSharedNote, VaultError> {
    if !SHARE_CODE_REGEX.is_match(code) {
        return Err(VaultError::not_found("Geçersiz paylaşım bağlantısı."));
    }

    let all = read_all_shares(data_dir).await;
    let share = all
        .iter()
        .find(|s| s.code == code)
        .ok_or_else(|| {
            VaultError::not_found(
                "Bu paylaşım veya davet bağlantısı geçersiz ya da süresi dolmuş.",
            )
        })?;

    let has_password = share.password_hash.is_some();
    if has_password && !unlocked_codes.contains(&share.code) {
        return Ok(PublicSharedNote {
            code: share.code.clone(),
            project: share.project.clone(),
            note: share.note.clone(),
            title: strip_ext(&share.note),
            content: String::new(),
            updated_at: share.created_at.clone(),
            permission: share.permission.clone(),
            kind: share.kind.clone(),
            invitee_name: share.invitee_name.clone(),
            has_password: Some(true),
            requires_password: Some(true),
        });
    }

    let doc = crate::vault::read_note(data_dir, &share.project, &share.note).await?;
    Ok(PublicSharedNote {
        code: share.code.clone(),
        project: doc.project,
        note: doc.name,
        title: doc.title,
        content: doc.content,
        updated_at: doc.updated_at,
        permission: share.permission.clone(),
        kind: share.kind.clone(),
        invitee_name: share.invitee_name.clone(),
        has_password: if has_password { Some(true) } else { None },
        requires_password: None,
    })
}

/// Saves changes to a shared note if the share allows edit permission and password is authenticated
pub async fn save_shared_note(
    data_dir: &Path,
    code: &str,
    content: &str,
    unlocked_codes: &HashSet<String>,
) -> Result<PublicSharedNote, VaultError> {
    if !SHARE_CODE_REGEX.is_match(code) {
        return Err(VaultError::not_found("Geçersiz paylaşım bağlantısı."));
    }

    let all = read_all_shares(data_dir).await;
    let share = all
        .iter()
        .find(|s| s.code == code)
        .ok_or_else(|| {
            VaultError::not_found("Bu paylaşım bağlantısı geçersiz veya iptal edilmiş.")
        })?;

    if share.password_hash.is_some() && !unlocked_codes.contains(&share.code) {
        return Err(VaultError::unauthorized(
            "Bu paylaşımı düzenlemek için şifre doğrulaması gerekli.",
        ));
    }

    if share.permission != "edit" {
        return Err(VaultError::forbidden(
            "Bu bağlantı yalnızca okuma (salt okunur) iznine sahiptir.",
        ));
    }

    let doc = crate::vault::save_note(data_dir, &share.project, &share.note, content).await?;
    Ok(PublicSharedNote {
        code: share.code.clone(),
        project: doc.project,
        note: doc.name,
        title: doc.title,
        content: doc.content,
        updated_at: doc.updated_at,
        permission: share.permission.clone(),
        kind: share.kind.clone(),
        invitee_name: share.invitee_name.clone(),
        has_password: if share.password_hash.is_some() {
            Some(true)
        } else {
            None
        },
        requires_password: None,
    })
}

/// Reads app settings from `.notika-settings.json` or writes and returns defaults
pub async fn get_app_settings(
    data_dir: &Path,
    fallback_token: Option<&str>,
) -> Result<AppSettings, VaultError> {
    let file_path = data_dir.join(SETTINGS_FILE);
    if let Ok(raw) = tokio::fs::read_to_string(&file_path).await {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
            let mcp_enabled = parsed
                .get("mcpEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            let mcp_token = parsed
                .get("mcpToken")
                .and_then(|v| v.as_str())
                .filter(|s| s.len() >= 16)
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    fallback_token
                        .filter(|t| !t.trim().is_empty())
                        .map(|t| t.to_string())
                        .unwrap_or_else(generate_mcp_token)
                });

            return Ok(AppSettings {
                mcp_enabled,
                mcp_token,
            });
        }
    }

    let env_token = fallback_token
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            std::env::var("MCP_TOKEN")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });

    let defaults = AppSettings {
        mcp_enabled: true,
        mcp_token: env_token.unwrap_or_else(generate_mcp_token),
    };

    if let Ok(json_str) = serde_json::to_string_pretty(&defaults) {
        let _ = tokio::fs::create_dir_all(data_dir).await;
        let _ = tokio::fs::write(&file_path, json_str).await;
    }

    Ok(defaults)
}

/// Updates app settings with optional mcp_enabled flag
pub async fn update_app_settings(
    data_dir: &Path,
    mcp_enabled: Option<bool>,
) -> Result<AppSettings, VaultError> {
    let current = get_app_settings(data_dir, None).await?;
    let next = AppSettings {
        mcp_enabled: mcp_enabled.unwrap_or(current.mcp_enabled),
        mcp_token: current.mcp_token,
    };

    let file_path = data_dir.join(SETTINGS_FILE);
    if let Ok(json_str) = serde_json::to_string_pretty(&next) {
        let _ = tokio::fs::write(&file_path, json_str).await;
    }

    Ok(next)
}

/// Generates a new MCP token and saves it to `.notika-settings.json`
pub async fn regenerate_mcp_token(data_dir: &Path) -> Result<AppSettings, VaultError> {
    let current = get_app_settings(data_dir, None).await?;
    let next = AppSettings {
        mcp_enabled: current.mcp_enabled,
        mcp_token: generate_mcp_token(),
    };

    let file_path = data_dir.join(SETTINGS_FILE);
    if let Ok(json_str) = serde_json::to_string_pretty(&next) {
        let _ = tokio::fs::write(&file_path, json_str).await;
    }

    Ok(next)
}
