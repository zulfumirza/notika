use std::collections::HashMap;
use std::path::{Path, PathBuf};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::VaultError;
use crate::locks::{
    restore_note_lock_hash, restore_project_lock_hashes, take_note_lock_hash,
    take_project_lock_hashes,
};
use crate::models::{NoteDocument, ProjectAppearance, StoredTrashItem, TrashItem};
use crate::project_meta::{restore_project_appearance, take_project_appearance};
use crate::vault::{
    read_note, resolve_note_path, resolve_project_path, validate_safe_name,
};

pub const TRASH_DIR_NAME: &str = ".trash";
pub const TRASH_ITEMS_DIR_NAME: &str = "items";
pub const TRASH_MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTrashResult {
    pub kind: String,
    pub project: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored: Option<NoteDocument>,
}

fn strip_ext(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".md") {
        name[..name.len() - 3].to_string()
    } else if lower.ends_with(".txt") {
        name[..name.len() - 4].to_string()
    } else {
        name.to_string()
    }
}

async fn ensure_trash_dirs(data_dir: &Path) -> Result<(PathBuf, PathBuf), std::io::Error> {
    let trash_dir = data_dir.join(TRASH_DIR_NAME);
    let items_dir = trash_dir.join(TRASH_ITEMS_DIR_NAME);
    tokio::fs::create_dir_all(&items_dir).await?;
    Ok((trash_dir, items_dir))
}

fn manifest_path(data_dir: &Path) -> PathBuf {
    data_dir.join(TRASH_DIR_NAME).join(TRASH_MANIFEST_FILE)
}

pub async fn read_manifest(data_dir: &Path) -> Vec<StoredTrashItem> {
    let path = manifest_path(data_dir);
    let raw = match tokio::fs::read_to_string(&path).await {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub async fn write_manifest(data_dir: &Path, manifest: &[StoredTrashItem]) {
    let path = manifest_path(data_dir);
    if let Ok((trash_dir, _)) = ensure_trash_dirs(data_dir).await {
        let _ = tokio::fs::create_dir_all(&trash_dir).await;
        if let Ok(json_str) = serde_json::to_string_pretty(manifest) {
            let _ = tokio::fs::write(&path, json_str).await;
        }
    }
}

fn is_supported_note_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    (lower.ends_with(".md") || lower.ends_with(".txt")) && !name.starts_with('.')
}

pub async fn calculate_project_stats(dir_path: &Path) -> Result<(usize, u64), std::io::Error> {
    let mut note_count = 0usize;
    let mut total_size = 0u64;

    let mut entries = tokio::fs::read_dir(dir_path).await?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let file_type = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_file() && is_supported_note_name(&file_name) {
            note_count += 1;
            if let Ok(meta) = entry.metadata().await {
                total_size += meta.len();
            }
        }
    }

    Ok((note_count, total_size))
}

pub async fn list_trash(data_dir: &Path) -> Result<Vec<TrashItem>, VaultError> {
    let manifest = read_manifest(data_dir).await;
    let items = manifest.into_iter().map(|item| item.to_public_trash_item()).collect();
    Ok(items)
}

pub async fn move_note_to_trash(
    data_dir: &Path,
    project: &str,
    note: &str,
) -> Result<TrashItem, VaultError> {
    let resolved = resolve_note_path(data_dir, project, note).await?;
    if !resolved.file_path.is_file() {
        return Err(VaultError::not_found("Silinecek not dosyası bulunamadı."));
    }

    let meta = tokio::fs::metadata(&resolved.file_path)
        .await
        .map_err(|_| VaultError::internal("Dosya bilgileri okunamadı."))?;
    let size = meta.len();

    let (_trash_dir, items_dir) = ensure_trash_dirs(data_dir)
        .await
        .map_err(|_| VaultError::internal("Çöp kutusu dizini açılamadı."))?;

    let trash_id = format!("note_{}_{}", Utc::now().timestamp_millis(), &resolved.note_name);
    let target_trash_path = items_dir.join(&trash_id);

    tokio::fs::rename(&resolved.file_path, &target_trash_path)
        .await
        .map_err(|_| VaultError::internal("Not çöp kutusuna taşınamadı."))?;

    let lock_hash = take_note_lock_hash(data_dir, &resolved.project_name, &resolved.note_name).await;
    let mut lock_hashes = None;
    if let Some(h) = lock_hash {
        let mut map = HashMap::new();
        map.insert(resolved.note_name.clone(), h);
        lock_hashes = Some(map);
    }

    let mut manifest = read_manifest(data_dir).await;
    let stored_item = StoredTrashItem {
        id: trash_id.clone(),
        kind: "note".to_string(),
        name: resolved.note_name.clone(),
        title: strip_ext(&resolved.note_name),
        project: resolved.project_name.clone(),
        deleted_at: Utc::now().to_rfc3339(),
        size,
        note_count: None,
        lock_hashes,
        project_appearance: None,
    };

    manifest.insert(0, stored_item.clone());
    write_manifest(data_dir, &manifest).await;

    Ok(stored_item.to_public_trash_item())
}

pub async fn move_project_to_trash(
    data_dir: &Path,
    project: &str,
) -> Result<TrashItem, VaultError> {
    let resolved = resolve_project_path(data_dir, project).await?;
    if !resolved.dir_path.is_dir() {
        return Err(VaultError::not_found("Silinecek proje klasörü bulunamadı."));
    }

    let (note_count, total_size) = calculate_project_stats(&resolved.dir_path)
        .await
        .map_err(|_| VaultError::internal("Proje istatistikleri okunamadı."))?;

    let (_trash_dir, items_dir) = ensure_trash_dirs(data_dir)
        .await
        .map_err(|_| VaultError::internal("Çöp kutusu dizini açılamadı."))?;

    let trash_id = format!("project_{}_{}", Utc::now().timestamp_millis(), &resolved.project_name);
    let target_trash_path = items_dir.join(&trash_id);

    tokio::fs::rename(&resolved.dir_path, &target_trash_path)
        .await
        .map_err(|_| VaultError::internal("Proje çöp kutusuna taşınamadı."))?;

    let project_appearance = take_project_appearance(data_dir, &resolved.project_name).await;
    let lock_hashes_map = take_project_lock_hashes(data_dir, &resolved.project_name).await;
    let lock_hashes = if lock_hashes_map.is_empty() {
        None
    } else {
        Some(lock_hashes_map)
    };

    let mut manifest = read_manifest(data_dir).await;
    let stored_item = StoredTrashItem {
        id: trash_id.clone(),
        kind: "project".to_string(),
        name: resolved.project_name.clone(),
        title: resolved.project_name.clone(),
        project: resolved.project_name.clone(),
        deleted_at: Utc::now().to_rfc3339(),
        size: total_size,
        note_count: Some(note_count),
        lock_hashes,
        project_appearance,
    };

    manifest.insert(0, stored_item.clone());
    write_manifest(data_dir, &manifest).await;

    Ok(stored_item.to_public_trash_item())
}

pub async fn restore_trash_item(
    data_dir: &Path,
    trash_id: &str,
) -> Result<RestoreTrashResult, VaultError> {
    let mut manifest = read_manifest(data_dir).await;
    let idx = manifest
        .iter()
        .position(|item| item.id == trash_id)
        .ok_or_else(|| VaultError::not_found("Geri yüklenecek çöp öğesi bulunamadı."))?;

    let item = manifest.remove(idx);
    let (_trash_dir, items_dir) = ensure_trash_dirs(data_dir)
        .await
        .map_err(|_| VaultError::internal("Çöp kutusu açılamadı."))?;

    let trash_item_path = items_dir.join(&item.id);
    if !trash_item_path.exists() {
        write_manifest(data_dir, &manifest).await;
        return Err(VaultError::not_found("Çöp kutusundaki dosya diskte bulunamadı."));
    }

    if item.kind == "note" {
        let target_project = validate_safe_name(&item.project, "project")?;
        let target_project_dir = data_dir.join(&target_project);
        tokio::fs::create_dir_all(&target_project_dir).await?;

        let safe_name = validate_safe_name(&item.name, "note")?;
        let ext = if safe_name.to_lowercase().ends_with(".txt") { ".txt" } else { ".md" };
        let base = strip_ext(&safe_name);

        let mut final_name = safe_name.clone();
        let mut counter = 1usize;
        while target_project_dir.join(&final_name).exists() {
            final_name = format!("{} (Geri Yüklenen {}){}", base, counter, ext);
            counter += 1;
        }

        let destination = target_project_dir.join(&final_name);
        tokio::fs::rename(&trash_item_path, &destination)
            .await
            .map_err(|_| VaultError::internal("Not geri yüklenirken dosya taşınamadı."))?;

        if let Some(hashes) = &item.lock_hashes {
            if let Some(hash) = hashes.get(&item.name) {
                restore_note_lock_hash(data_dir, &target_project, &final_name, hash).await;
            }
        }

        write_manifest(data_dir, &manifest).await;
        let restored_doc = read_note(data_dir, &target_project, &final_name).await.ok();

        Ok(RestoreTrashResult {
            kind: "note".to_string(),
            project: target_project,
            name: final_name,
            restored: restored_doc,
        })
    } else {
        let safe_project = validate_safe_name(&item.name, "project")?;
        let mut final_project = safe_project.clone();
        let mut counter = 1usize;
        while data_dir.join(&final_project).exists() {
            final_project = format!("{} (Geri Yüklenen {})", safe_project, counter);
            counter += 1;
        }

        let destination = data_dir.join(&final_project);
        tokio::fs::rename(&trash_item_path, &destination)
            .await
            .map_err(|_| VaultError::internal("Proje geri yüklenirken klasör taşınamadı."))?;

        if let Some(appearance) = item.project_appearance {
            restore_project_appearance(data_dir, &final_project, appearance).await;
        }

        if let Some(hashes) = &item.lock_hashes {
            restore_project_lock_hashes(data_dir, &final_project, hashes).await;
        }

        write_manifest(data_dir, &manifest).await;

        Ok(RestoreTrashResult {
            kind: "project".to_string(),
            project: final_project.clone(),
            name: final_project,
            restored: None,
        })
    }
}

pub async fn purge_trash_item(data_dir: &Path, trash_id: &str) -> Result<(), VaultError> {
    let mut manifest = read_manifest(data_dir).await;
    let idx = manifest
        .iter()
        .position(|item| item.id == trash_id)
        .ok_or_else(|| VaultError::not_found("Kalıcı olarak silinecek çöp öğesi bulunamadı."))?;

    let item = manifest.remove(idx);
    let (_trash_dir, items_dir) = ensure_trash_dirs(data_dir)
        .await
        .map_err(|_| VaultError::internal("Çöp kutusu açılamadı."))?;

    let trash_item_path = items_dir.join(&item.id);
    if trash_item_path.is_file() {
        let _ = tokio::fs::remove_file(&trash_item_path).await;
    } else if trash_item_path.is_dir() {
        let _ = tokio::fs::remove_dir_all(&trash_item_path).await;
    }

    write_manifest(data_dir, &manifest).await;
    Ok(())
}

pub async fn empty_trash(data_dir: &Path) -> Result<(), VaultError> {
    let (_trash_dir, items_dir) = ensure_trash_dirs(data_dir)
        .await
        .map_err(|_| VaultError::internal("Çöp kutusu açılamadı."))?;

    if let Ok(mut entries) = tokio::fs::read_dir(&items_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                let _ = tokio::fs::remove_dir_all(&path).await;
            } else {
                let _ = tokio::fs::remove_file(&path).await;
            }
        }
    }

    write_manifest(data_dir, &[]).await;
    Ok(())
}
