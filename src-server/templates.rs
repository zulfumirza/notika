use std::path::{Path, PathBuf};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::VaultError;
use crate::models::TemplateItem;
use crate::vault::validate_safe_name;

pub const TEMPLATES_DIR_NAME: &str = "templates";

pub struct DefaultTemplate {
    pub filename: &'static str,
    pub content: &'static str,
}

pub const DEFAULT_TEMPLATES: &[DefaultTemplate] = &[
    DefaultTemplate {
        filename: "Toplanti-Notu.md",
        content: "---\ntags: [meeting, notes]\ndate: {{date}}\nstatus: draft\n---\n\n# {{title}}\n\n## Katılımcılar\n- \n\n## Gündem\n1. \n\n## Kararlar ve Aksiyonlar\n- [ ] \n",
    },
    DefaultTemplate {
        filename: "Proje-Ozeti.md",
        content: "---\ntags: [project, spec]\ncreated: {{date}}\nowner: \n---\n\n# {{title}}\n\n## Amaç\nKısa proje hedefi ve kapsamı.\n\n## Teknik Mimari\n- Bileşenler:\n- Bağımlılıklar:\n\n## Yapılacaklar\n- [ ] İlk adımı tanımla\n",
    },
];

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSaveOptions {
    #[serde(default)]
    pub previous_name: Option<String>,
    #[serde(default)]
    pub must_not_exist: Option<bool>,
}

async fn ensure_templates_dir(data_dir: &Path) -> Result<PathBuf, std::io::Error> {
    tokio::fs::create_dir_all(data_dir).await?;
    let templates_dir = data_dir.join(TEMPLATES_DIR_NAME);
    let existed = templates_dir.exists();
    tokio::fs::create_dir_all(&templates_dir).await?;

    if !existed {
        for tpl in DEFAULT_TEMPLATES {
            let target = templates_dir.join(tpl.filename);
            let _ = tokio::fs::write(&target, tpl.content).await;
        }
    }

    Ok(templates_dir)
}

fn assert_inside_templates_dir(
    templates_dir: &Path,
    candidate_path: &Path,
) -> Result<(), VaultError> {
    let root = dunce::canonicalize(templates_dir).unwrap_or_else(|_| templates_dir.to_path_buf());
    let parent = candidate_path.parent().unwrap_or(templates_dir);
    let normalized_parent = dunce::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());

    if !normalized_parent.starts_with(&root) {
        return Err(VaultError::bad_request("Geçersiz şablon yolu erişimi engellendi."));
    }

    Ok(())
}

fn to_template_md_name(raw_name: &str) -> Result<String, VaultError> {
    let safe = validate_safe_name(raw_name, "note")?;
    let lower = safe.to_lowercase();
    if lower.ends_with(".txt") {
        Ok(format!("{}.md", &safe[..safe.len() - 4]))
    } else {
        Ok(safe)
    }
}

fn strip_ext(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".md") {
        name[..name.len() - 3].to_string()
    } else {
        name.to_string()
    }
}

/// Lists all templates available in the templates directory
pub async fn list_templates(data_dir: &Path) -> Result<Vec<TemplateItem>, VaultError> {
    let templates_dir = ensure_templates_dir(data_dir)
        .await
        .map_err(|_| VaultError::internal("Şablonlar klasörü açılamadı."))?;

    let mut dir_entries = tokio::fs::read_dir(&templates_dir)
        .await
        .map_err(|_| VaultError::internal("Şablonlar klasörü okunamadı."))?;

    let mut items = Vec::new();

    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        let file_type = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_type.is_file()
            || file_name.starts_with('.')
            || !file_name.to_lowercase().ends_with(".md")
        {
            continue;
        }

        let file_path = templates_dir.join(&file_name);
        if assert_inside_templates_dir(&templates_dir, &file_path).is_err() {
            continue;
        }

        let stat = match tokio::fs::metadata(&file_path).await {
            Ok(m) => m,
            Err(_) => continue,
        };

        let content = match tokio::fs::read_to_string(&file_path).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        let updated_at = stat
            .modified()
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| Utc::now().to_rfc3339());

        items.push(TemplateItem {
            name: file_name.clone(),
            title: strip_ext(&file_name),
            content,
            updated_at,
        });
    }

    items.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(items)
}

/// Creates or updates a template file
pub async fn create_or_save_template(
    data_dir: &Path,
    name: &str,
    content: &str,
    must_not_exist: bool,
    previous_name: Option<&str>,
) -> Result<TemplateItem, VaultError> {
    let templates_dir = ensure_templates_dir(data_dir)
        .await
        .map_err(|_| VaultError::internal("Şablonlar klasörü açılamadı."))?;

    let safe_name = to_template_md_name(name)?;
    let target_path = templates_dir.join(&safe_name);
    assert_inside_templates_dir(&templates_dir, &target_path)?;

    if must_not_exist && target_path.exists() {
        return Err(VaultError::conflict(
            format!("\"{}\" adlı şablon zaten mevcut.", safe_name),
        ));
    }

    if let Some(prev) = previous_name {
        let prev_trimmed = prev.trim();
        if !prev_trimmed.is_empty() {
            let prev_safe_name = to_template_md_name(prev_trimmed)?;
            if prev_safe_name != safe_name {
                let prev_path = templates_dir.join(&prev_safe_name);
                assert_inside_templates_dir(&templates_dir, &prev_path)?;

                if target_path.exists() {
                    return Err(VaultError::conflict(
                        format!("\"{}\" adlı şablon zaten mevcut.", safe_name),
                    ));
                }

                if prev_path.exists() {
                    let _ = tokio::fs::remove_file(&prev_path).await;
                }
            }
        }
    }

    tokio::fs::write(&target_path, content)
        .await
        .map_err(|_| VaultError::internal("Şablon dosyası diske kaydedilemedi."))?;

    let stat = tokio::fs::metadata(&target_path)
        .await
        .map_err(|_| VaultError::internal("Şablon bilgisi okunamadı."))?;

    let updated_at = stat
        .modified()
        .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_else(|_| Utc::now().to_rfc3339());

    Ok(TemplateItem {
        name: safe_name.clone(),
        title: strip_ext(&safe_name),
        content: content.to_string(),
        updated_at,
    })
}

/// Deletes a template file by name
pub async fn delete_template(data_dir: &Path, name: &str) -> Result<(), VaultError> {
    let templates_dir = ensure_templates_dir(data_dir)
        .await
        .map_err(|_| VaultError::internal("Şablonlar klasörü açılamadı."))?;

    let safe_name = to_template_md_name(name)?;
    let target_path = templates_dir.join(&safe_name);
    assert_inside_templates_dir(&templates_dir, &target_path)?;

    match tokio::fs::metadata(&target_path).await {
        Ok(m) if m.is_file() => {}
        _ => return Err(VaultError::not_found("Şablon dosyası bulunamadı.")),
    }

    tokio::fs::remove_file(&target_path)
        .await
        .map_err(|_| VaultError::internal("Şablon dosyası silinemedi."))?;

    Ok(())
}
