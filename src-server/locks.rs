use std::collections::{HashMap, HashSet};
use std::path::Path;
use axum::http::{header, HeaderMap};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;

use crate::error::VaultError;

type HmacSha256 = Hmac<Sha256>;

pub const LOCKS_FILE: &str = ".notika-locks.json";
pub const NOTE_UNLOCK_COOKIE: &str = "notika_note_unlocks";
pub const SHARE_UNLOCK_COOKIE: &str = "notika_share_unlocks";
pub const UNLOCK_TTL_SECONDS: i64 = 43200; // 12 hours

#[derive(Debug, Serialize, Deserialize)]
struct UnlockCookiePayload {
    items: Vec<String>,
    exp: i64,
}

/// Generates a key in the format "project/note"
pub fn make_note_key(project: &str, note: &str) -> String {
    format!("{}/{}", project, note)
}

/// Derives a 64-byte key using scrypt (N=16384, r=8, p=1) and returns "salt:derived_hex"
pub fn hash_password_secret(password: &str) -> String {
    let mut salt_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt_bytes);
    let salt = hex::encode(salt_bytes);

    let params = scrypt::Params::new(14, 8, 1, 32 * 1024 * 1024)
        .expect("Geçerli scrypt parametreleri");
    let mut derived = [0u8; 64];
    scrypt::scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut derived)
        .expect("scrypt türetme başarısız oldu");

    format!("{}:{}", salt, hex::encode(derived))
}

/// Verifies a password against a stored "salt:derived_hex" string in constant time
pub fn verify_password_secret(password: &str, stored_hash: &str) -> bool {
    let parts: Vec<&str> = stored_hash.split(':').collect();
    if parts.len() != 2 {
        return false;
    }
    let salt = parts[0];
    let hex_key = parts[1];
    if salt.is_empty() || hex_key.is_empty() {
        return false;
    }

    let key_buf = match hex::decode(hex_key) {
        Ok(buf) => buf,
        Err(_) => return false,
    };
    if key_buf.len() != 64 {
        return false;
    }

    let params = match scrypt::Params::new(14, 8, 1, 32 * 1024 * 1024) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let mut derived = [0u8; 64];
    if scrypt::scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut derived).is_err() {
        return false;
    }

    key_buf.ct_eq(&derived).into()
}

/// Reads the locks map from `.notika-locks.json` in the given data directory
pub async fn read_locks_map(data_dir: &Path) -> HashMap<String, String> {
    let file_path = data_dir.join(LOCKS_FILE);
    let raw = match tokio::fs::read_to_string(&file_path).await {
        Ok(content) => content,
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

    let mut out = HashMap::new();
    for (k, v) in obj {
        if let Some(val_str) = v.as_str() {
            if val_str.contains(':') {
                out.insert(k.clone(), val_str.to_string());
            }
        }
    }
    out
}

/// Writes the locks map to `.notika-locks.json` in the given data directory
async fn write_locks_map(data_dir: &Path, map: &HashMap<String, String>) {
    let file_path = data_dir.join(LOCKS_FILE);
    if let Ok(json_str) = serde_json::to_string_pretty(map) {
        let _ = tokio::fs::create_dir_all(data_dir).await;
        let _ = tokio::fs::write(&file_path, json_str).await;
    }
}

/// Returns a set of all locked note keys ("project/note")
pub async fn list_locked_note_keys(data_dir: &Path) -> HashSet<String> {
    let map = read_locks_map(data_dir).await;
    map.into_keys().collect()
}

/// Checks if a note is locked with a password
pub async fn is_note_locked(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Result<bool, VaultError> {
    let map = read_locks_map(data_dir).await;
    Ok(map.contains_key(&make_note_key(project, note)))
}

/// Verifies whether the provided password matches the locked note's password.
/// Returns true if the note has no password lock.
pub async fn verify_note_password(
    data_dir: &Path,
    project: &str,
    note: &str,
    password: &str,
) -> Result<bool, VaultError> {
    let map = read_locks_map(data_dir).await;
    let key = make_note_key(project, note);
    match map.get(&key) {
        None => Ok(true),
        Some(hash) => Ok(verify_password_secret(password, hash)),
    }
}

/// Sets or updates the lock password for a note
pub async fn set_note_password(
    data_dir: &Path,
    project: &str,
    note: &str,
    password: &str,
) -> Result<(), VaultError> {
    let mut map = read_locks_map(data_dir).await;
    map.insert(make_note_key(project, note), hash_password_secret(password));
    write_locks_map(data_dir, &map).await;
    Ok(())
}

/// Removes the password lock from a note
pub async fn remove_note_password(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Result<(), VaultError> {
    let mut map = read_locks_map(data_dir).await;
    let key = make_note_key(project, note);
    if map.remove(&key).is_some() {
        write_locks_map(data_dir, &map).await;
    }
    Ok(())
}

/// Relocates a note lock to a new project and/or note name
pub async fn relocate_note_lock(
    data_dir: &Path,
    old_project: &str,
    old_note: &str,
    new_project: &str,
    new_note: &str,
) -> Result<(), VaultError> {
    let old_key = make_note_key(old_project, old_note);
    let new_key = make_note_key(new_project, new_note);
    if old_key == new_key {
        return Ok(());
    }

    let mut map = read_locks_map(data_dir).await;
    if let Some(hash) = map.remove(&old_key) {
        map.insert(new_key, hash);
        write_locks_map(data_dir, &map).await;
    }
    Ok(())
}

/// Relocates all note locks belonging to an old project to a new project name
pub async fn relocate_project_locks(
    data_dir: &Path,
    old_project: &str,
    new_project: &str,
) -> Result<(), VaultError> {
    if old_project == new_project {
        return Ok(());
    }

    let map = read_locks_map(data_dir).await;
    let prefix = format!("{}/", old_project);
    let mut changed = false;
    let mut next = HashMap::new();

    for (k, v) in map {
        if let Some(suffix) = k.strip_prefix(&prefix) {
            next.insert(format!("{}/{}", new_project, suffix), v);
            changed = true;
        } else {
            next.insert(k, v);
        }
    }

    if changed {
        write_locks_map(data_dir, &next).await;
    }
    Ok(())
}

/// Deletes all locks for all notes in a project
pub async fn delete_project_locks(
    data_dir: &Path,
    project: &str,
) -> Result<(), VaultError> {
    let map = read_locks_map(data_dir).await;
    let prefix = format!("{}/", project);
    let mut changed = false;
    let mut next = HashMap::new();

    for (k, v) in map {
        if k.starts_with(&prefix) {
            changed = true;
        } else {
            next.insert(k, v);
        }
    }

    if changed {
        write_locks_map(data_dir, &next).await;
    }
    Ok(())
}

/// Removes and returns the lock hash for a note (used when moving to trash)
pub async fn take_note_lock_hash(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Option<String> {
    let mut map = read_locks_map(data_dir).await;
    let key = make_note_key(project, note);
    let hash = map.remove(&key)?;
    write_locks_map(data_dir, &map).await;
    Some(hash)
}

/// Restores a lock hash for a note (used when restoring from trash)
pub async fn restore_note_lock_hash(
    data_dir: &Path,
    project: &str,
    note: &str,
    hash: &str,
) {
    let mut map = read_locks_map(data_dir).await;
    map.insert(make_note_key(project, note), hash.to_string());
    write_locks_map(data_dir, &map).await;
}

/// Removes and returns all lock hashes for a project (used when moving a project to trash)
pub async fn take_project_lock_hashes(
    data_dir: &Path,
    project: &str,
) -> HashMap<String, String> {
    let mut map = read_locks_map(data_dir).await;
    let prefix = format!("{}/", project);
    let mut extracted = HashMap::new();
    let mut remaining = HashMap::new();
    let mut changed = false;

    for (k, v) in map.drain() {
        if let Some(suffix) = k.strip_prefix(&prefix) {
            extracted.insert(suffix.to_string(), v);
            changed = true;
        } else {
            remaining.insert(k, v);
        }
    }

    if changed {
        write_locks_map(data_dir, &remaining).await;
    }
    extracted
}

/// Restores lock hashes for notes in a project (used when restoring a project from trash)
pub async fn restore_project_lock_hashes(
    data_dir: &Path,
    project: &str,
    hashes: &HashMap<String, String>,
) {
    if hashes.is_empty() {
        return;
    }
    let mut map = read_locks_map(data_dir).await;
    for (note_name, hash) in hashes {
        map.insert(make_note_key(project, note_name), hash.clone());
    }
    write_locks_map(data_dir, &map).await;
}

fn sign_hmac_sha256(encoded: &str, secret: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(encoded.as_bytes());
    let result = mac.finalize().into_bytes();
    URL_SAFE_NO_PAD.encode(result)
}

fn get_cookie_value<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    for pair in cookie_header.split(';') {
        let trimmed = pair.trim();
        if let Some((k, v)) = trimmed.split_once('=') {
            if k.trim() == name {
                return Some(v.trim());
            }
        }
    }
    None
}

/// Parses and verifies a signed set cookie (e.g. note/share unlocks)
pub fn read_signed_set_cookie(
    cookie_header: Option<&str>,
    cookie_name: &str,
    secret: &str,
) -> HashSet<String> {
    let header = match cookie_header {
        Some(h) => h,
        None => return HashSet::new(),
    };

    let raw_token = match get_cookie_value(header, cookie_name) {
        Some(t) => t,
        None => return HashSet::new(),
    };

    let parts: Vec<&str> = raw_token.split('.').collect();
    if parts.len() != 2 {
        return HashSet::new();
    }

    let encoded = parts[0];
    let signature = parts[1];
    if encoded.is_empty() || signature.is_empty() {
        return HashSet::new();
    }

    let expected = sign_hmac_sha256(encoded, secret);
    if signature.as_bytes().len() != expected.as_bytes().len()
        || !bool::from(signature.as_bytes().ct_eq(expected.as_bytes()))
    {
        return HashSet::new();
    }

    let decoded_bytes = match URL_SAFE_NO_PAD.decode(encoded) {
        Ok(b) => b,
        Err(_) => return HashSet::new(),
    };

    let payload: UnlockCookiePayload = match serde_json::from_slice(&decoded_bytes) {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };

    let now_sec = Utc::now().timestamp();
    if payload.exp <= now_sec {
        return HashSet::new();
    }

    payload.items.into_iter().collect()
}

/// Builds a Set-Cookie header value containing a signed set of unlock items
pub fn build_signed_set_cookie(
    cookie_name: &str,
    items: &HashSet<String>,
    secret: &str,
    is_https: bool,
) -> String {
    let mut item_list: Vec<String> = items.iter().cloned().collect();
    if item_list.len() > 80 {
        let start = item_list.len() - 80;
        item_list = item_list[start..].to_vec();
    }

    let payload = UnlockCookiePayload {
        items: item_list,
        exp: Utc::now().timestamp() + UNLOCK_TTL_SECONDS,
    };

    let json_bytes = serde_json::to_vec(&payload).unwrap_or_default();
    let encoded = URL_SAFE_NO_PAD.encode(&json_bytes);
    let signature = sign_hmac_sha256(&encoded, secret);
    let token = format!("{}.{}", encoded, signature);

    let mut cookie = format!(
        "{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        cookie_name, token, UNLOCK_TTL_SECONDS
    );
    if is_https {
        cookie.push_str("; Secure");
    }
    cookie
}

/// Returns the set of unlocked note keys from the request's HeaderMap
pub fn get_unlocked_note_keys(headers: &HeaderMap, secret: &str) -> HashSet<String> {
    let cookie_header = headers.get(header::COOKIE).and_then(|v| v.to_str().ok());
    read_signed_set_cookie(cookie_header, NOTE_UNLOCK_COOKIE, secret)
}

/// Adds a note key to the unlocked notes cookie and returns the Set-Cookie string
pub fn add_unlocked_note_cookie(
    headers: &HeaderMap,
    key: &str,
    secret: &str,
    is_https: bool,
) -> String {
    let mut items = get_unlocked_note_keys(headers, secret);
    items.insert(key.to_string());
    build_signed_set_cookie(NOTE_UNLOCK_COOKIE, &items, secret, is_https)
}

/// Removes a note key from the unlocked notes cookie and returns the updated Set-Cookie string
pub fn remove_unlocked_note_cookie(
    headers: &HeaderMap,
    key: &str,
    secret: &str,
    is_https: bool,
) -> Option<String> {
    let mut items = get_unlocked_note_keys(headers, secret);
    if items.remove(key) {
        Some(build_signed_set_cookie(NOTE_UNLOCK_COOKIE, &items, secret, is_https))
    } else {
        None
    }
}

/// Returns the set of unlocked share codes from the request's HeaderMap
pub fn get_unlocked_share_codes(headers: &HeaderMap, secret: &str) -> HashSet<String> {
    let cookie_header = headers.get(header::COOKIE).and_then(|v| v.to_str().ok());
    read_signed_set_cookie(cookie_header, SHARE_UNLOCK_COOKIE, secret)
}

/// Adds a share code to the unlocked shares cookie and returns the Set-Cookie string
pub fn add_unlocked_share_cookie(
    headers: &HeaderMap,
    code: &str,
    secret: &str,
    is_https: bool,
) -> String {
    let mut items = get_unlocked_share_codes(headers, secret);
    items.insert(code.to_string());
    build_signed_set_cookie(SHARE_UNLOCK_COOKIE, &items, secret, is_https)
}

/// Removes a share code from the unlocked shares cookie and returns the updated Set-Cookie string
pub fn remove_unlocked_share_cookie(
    headers: &HeaderMap,
    code: &str,
    secret: &str,
    is_https: bool,
) -> Option<String> {
    let mut items = get_unlocked_share_codes(headers, secret);
    if items.remove(code) {
        Some(build_signed_set_cookie(SHARE_UNLOCK_COOKIE, &items, secret, is_https))
    } else {
        None
    }
}
