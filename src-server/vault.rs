use std::path::{Path, PathBuf};

use chrono::Utc;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::VaultError;
use crate::locks::{
    delete_project_locks, list_locked_note_keys, make_note_key, relocate_note_lock,
    relocate_project_locks, remove_note_password,
};
use crate::models::{
    extract_note_appearance, extract_tags_from_markdown, is_frontmatter_pinned,
    normalize_note_color_id, normalize_note_icon_id, patch_frontmatter_appearance,
    set_frontmatter_appearance, set_frontmatter_pinned, NoteDocument, NoteMeta, ProjectAppearance,
    ProjectTreeItem, SearchResultItem,
};
use crate::project_meta::{
    read_project_appearance_map, relocate_project_appearance, set_project_appearance,
    ProjectAppearanceUpdate,
};

pub const MAX_NAME_LENGTH: usize = 120;

static INVALID_CHARS_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"[<>:"/\\|?*\x00-\x1F]"#).expect("Invalid regex for invalid characters")
});

static WINDOWS_RESERVED_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$")
        .expect("Invalid regex for Windows reserved names")
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedNote {
    pub project_name: String,
    pub note_name: String,
    pub project_path: PathBuf,
    pub note_path: PathBuf,
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            std::path::Component::Prefix(p) => out.push(comp.as_os_str()),
            std::path::Component::RootDir => out.push(comp.as_os_str()),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::Normal(n) => {
                out.push(n);
            }
        }
    }
    out
}

fn to_absolute(path: &Path) -> PathBuf {
    if path.is_absolute() {
        normalize_path(path)
    } else {
        match std::env::current_dir() {
            Ok(cwd) => normalize_path(&cwd.join(path)),
            Err(_) => normalize_path(path),
        }
    }
}

pub fn format_system_time(st: std::time::SystemTime) -> String {
    let dt: chrono::DateTime<Utc> = st.into();
    dt.to_rfc3339()
}

pub fn turkish_char_rank(c: char) -> u32 {
    match c {
        'a' | 'A' => 10,
        'b' | 'B' => 20,
        'c' | 'C' => 30,
        'ç' | 'Ç' => 40,
        'd' | 'D' => 50,
        'e' | 'E' => 60,
        'f' | 'F' => 70,
        'g' | 'G' => 80,
        'ğ' | 'Ğ' => 90,
        'h' | 'H' => 100,
        'ı' | 'I' => 110,
        'i' | 'İ' => 120,
        'j' | 'J' => 130,
        'k' | 'K' => 140,
        'l' | 'L' => 150,
        'm' | 'M' => 160,
        'n' | 'N' => 170,
        'o' | 'O' => 180,
        'ö' | 'Ö' => 190,
        'p' | 'P' => 200,
        'r' | 'R' => 210,
        's' | 'S' => 220,
        'ş' | 'Ş' => 230,
        't' | 'T' => 240,
        'u' | 'U' => 250,
        'ü' | 'Ü' => 260,
        'v' | 'V' => 270,
        'y' | 'Y' => 280,
        'z' | 'Z' => 290,
        other => 1000 + (other as u32),
    }
}

pub fn turkish_collate_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut a_chars = a.chars();
    let mut b_chars = b.chars();

    loop {
        match (a_chars.next(), b_chars.next()) {
            (Some(ac), Some(bc)) => {
                let rank_a = turkish_char_rank(ac);
                let rank_b = turkish_char_rank(bc);
                if rank_a != rank_b {
                    return rank_a.cmp(&rank_b);
                }
                if ac != bc {
                    return ac.cmp(&bc);
                }
            }
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (None, None) => return std::cmp::Ordering::Equal,
        }
    }
}

/// Validates and normalizes project and note names.
/// - `kind` must be `"project"` or `"note"`.
/// - For notes: strips `.txt` or `.md` extension, validates base name, and reapplies canonical extension.
pub fn validate_safe_name(raw_name: &str, kind: &str) -> Result<String, VaultError> {
    let trimmed = raw_name.trim();

    let (mut normalized, note_ext) = if kind == "note" {
        let lower = trimmed.to_lowercase();
        if lower.ends_with(".txt") {
            (trimmed[..trimmed.len() - 4].trim().to_string(), ".txt")
        } else if lower.ends_with(".md") {
            (trimmed[..trimmed.len() - 3].trim().to_string(), ".md")
        } else {
            (trimmed.to_string(), ".md")
        }
    } else {
        (trimmed.to_string(), "")
    };

    if normalized.is_empty() {
        let msg = if kind == "project" {
            "Proje adı boş olamaz."
        } else {
            "Not adı boş olamaz."
        };
        return Err(VaultError::bad_request(msg));
    }

    if normalized.chars().count() > MAX_NAME_LENGTH {
        return Err(VaultError::bad_request(format!(
            "İsim en fazla {} karakter olabilir.",
            MAX_NAME_LENGTH
        )));
    }

    if normalized.starts_with('.')
        || normalized.ends_with('.')
        || normalized.contains("..")
        || INVALID_CHARS_REGEX.is_match(&normalized)
    {
        return Err(VaultError::bad_request(
            "İsim geçersiz karakterler içeriyor (/, \\, .. veya nokta ile başlama/bitme yasaktır).",
        ));
    }

    if WINDOWS_RESERVED_REGEX.is_match(&normalized) {
        return Err(VaultError::bad_request(
            "Bu isim sistem tarafından rezerve edilmiştir.",
        ));
    }

    if kind == "project" && normalized.eq_ignore_ascii_case("templates") {
        return Err(VaultError::bad_request(
            "\"templates\" klasör adı şablonlar için ayrılmıştır.",
        ));
    }

    if kind == "note" {
        normalized.push_str(note_ext);
    }

    Ok(normalized)
}

/// Checks that candidate path is inside root directory and not equal to root.
pub fn assert_inside_root(root_dir: &Path, candidate: &Path) -> Result<(), VaultError> {
    let abs_root = to_absolute(root_dir);
    let abs_candidate = to_absolute(candidate);

    if abs_candidate == abs_root || !abs_candidate.starts_with(&abs_root) {
        return Err(VaultError::bad_request(
            "Geçersiz dosya yolu erişimi engellendi.",
        ));
    }
    Ok(())
}

/// Verifies canonicalized real path to prevent symlink traversal outside root.
pub async fn assert_real_path_inside_root(
    root_dir: &Path,
    target: &Path,
) -> Result<(), VaultError> {
    let real_root = match dunce::canonicalize(root_dir) {
        Ok(p) => p,
        Err(_) => {
            return Err(VaultError::bad_request(
                "Geçersiz dosya yolu erişimi engellendi.",
            ));
        }
    };

    match dunce::canonicalize(target) {
        Ok(real_target) => {
            if real_target == real_root || !real_target.starts_with(&real_root) {
                return Err(VaultError::bad_request(
                    "Sembolik bağ ile dizin dışına çıkış engellendi.",
                ));
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // ENOENT is acceptable as new files/projects might not exist yet
        }
        Err(err) => {
            return Err(VaultError::bad_request(format!(
                "Dosya yolu doğrulama hatası: {}",
                err
            )));
        }
    }

    Ok(())
}

/// Resolves and validates a project path inside data directory.
pub async fn resolve_project_path(
    data_dir: &Path,
    raw_project: &str,
) -> Result<(String, PathBuf), VaultError> {
    let project_name = validate_safe_name(raw_project, "project")?;
    let project_path = data_dir.join(&project_name);
    assert_inside_root(data_dir, &project_path)?;
    assert_real_path_inside_root(data_dir, &project_path).await?;
    Ok((project_name, project_path))
}

/// Resolves and validates a note path inside its project folder.
pub async fn resolve_note_path(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
) -> Result<ResolvedNote, VaultError> {
    let (project_name, project_path) = resolve_project_path(data_dir, raw_project).await?;
    let note_name = validate_safe_name(raw_note, "note")?;
    let note_path = project_path.join(&note_name);
    assert_inside_root(&project_path, &note_path)?;
    assert_real_path_inside_root(data_dir, &note_path).await?;

    Ok(ResolvedNote {
        project_name,
        note_name,
        project_path,
        note_path,
    })
}

pub fn is_supported_note_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".txt")
}

pub fn strip_md_extension(filename: &str) -> String {
    let lower = filename.to_lowercase();
    if lower.ends_with(".md") {
        filename[..filename.len() - 3].to_string()
    } else if lower.ends_with(".txt") {
        filename[..filename.len() - 4].to_string()
    } else {
        filename.to_string()
    }
}

/// Ensures the data directory exists and seeds initial starter notes if not previously seeded.
pub async fn ensure_data_dir(data_dir: &Path) -> Result<(), VaultError> {
    tokio::fs::create_dir_all(data_dir)
        .await
        .map_err(|e| VaultError::internal(format!("Veri dizini oluşturulamadı: {}", e)))?;

    let seeded_marker = data_dir.join(".notika-seeded");
    if tokio::fs::try_exists(&seeded_marker).await.unwrap_or(false) {
        return Ok(());
    }

    let starter_project = data_dir.join("Notika");
    tokio::fs::create_dir_all(&starter_project)
        .await
        .map_err(|e| VaultError::internal(format!("Başlangıç projesi oluşturulamadı: {}", e)))?;

    let welcome_content = "# Notika'ya Hoş Geldiniz! 👋\n\n\
Notika, yerel markdown ve metin notlarınızı düzenlemenizi sağlayan hafif bir not defteridir.\n\n\
- Sol panelden projeler oluşturabilir ve notlarınızı organize edebilirsiniz.\n\
- Notlarınızı Markdown formatında zenginleştirebilirsiniz.\n\
- Not kilitleme ile gizli bilgilerinizi parola ile koruyabilirsiniz.\n\
- Notlarınızı dilediğiniz gibi arayabilir, sabitleyebilir ve renklendirebilirsiniz.\n";

    let howto_content = "# Nasıl Kullanılır? 🚀\n\n\
### 1. Yeni Not Oluşturma\n\
Sol taraftaki proje listesinden bir projeye tıklayın ve \"+ Yeni Not\" düğmesine basın.\n\n\
### 2. Not Kilitleme 🔒\n\
Bir notu kilitlemek için düzenleyicide sağ üstteki kilit simgesine tıklayın ve bir şifre belirleyin. Kilitlenen notların içeriği güvenle korunur.\n\n\
### 3. Markdown Desteği ✍️\n\
Notika standart Markdown sözdizimini destekler:\n\
- **Kalın metin**\n\
- *İtalik metin*\n\
- [Bağlantılar](https://github.com)\n\
- Kod blokları ve listeler\n\n\
### 4. Arama 🔍\n\
Üst kısımdaki arama çubuğunu kullanarak tüm notlarınızda hızlıca arama yapabilirsiniz.\n";

    let license_content = "MIT License\n\n\
Copyright (c) 2026 Notika Contributors\n\n\
Permission is hereby granted, free of charge, to any person obtaining a copy\n\
of this software and associated documentation files (the \"Software\"), to deal\n\
in the Software without restriction, including without limitation the rights\n\
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n\
copies of the Software, and to permit persons to whom the Software is\n\
furnished to do so, subject to the following conditions:\n\n\
The above copyright notice and this permission notice shall be included in all\n\
copies or substantial portions of the Software.\n\n\
THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n\
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n\
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n\
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n\
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n\
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n\
SOFTWARE.\n";

    let publisher_content = "# Yayıncının Notu 📌\n\n\
Notika, gizliliğe ve sadeliğe önem veren kullanıcılar için tasarlanmıştır.\n\n\
- Tüm verileriniz yerel bilgisayarınızda saklanır.\n\
- Sunucuya veya buluta üçüncü taraf veri aktarımı yapılmaz.\n\
- Verilerinizi taşımak için `data/` dizinini kopyalamanız yeterlidir.\n\n\
İyi not almalar dileriz!\n";

    let _ = tokio::fs::write(starter_project.join("01-Hos-Geldiniz.md"), welcome_content).await;
    let _ = tokio::fs::write(starter_project.join("02-Nasil-Kullanilir.md"), howto_content).await;
    let _ = tokio::fs::write(starter_project.join("03-Lisans.md"), license_content).await;
    let _ = tokio::fs::write(starter_project.join("04-Yayincinin-Notu.md"), publisher_content).await;

    let now_str = Utc::now().to_rfc3339();
    let _ = tokio::fs::write(&seeded_marker, now_str).await;

    Ok(())
}

/// Lists all projects and their contained notes in hierarchical tree format.
pub async fn list_vault_tree(data_dir: &Path) -> Result<Vec<ProjectTreeItem>, VaultError> {
    tokio::fs::create_dir_all(data_dir)
        .await
        .map_err(|e| VaultError::internal(format!("Veri dizini açılamadı: {}", e)))?;

    let locked_keys = list_locked_note_keys(data_dir).await;
    let project_appearances = read_project_appearance_map(data_dir).await;

    let mut dir_entries = tokio::fs::read_dir(data_dir)
        .await
        .map_err(|e| VaultError::internal(format!("Dizin okunamadı: {}", e)))?;

    let mut projects: Vec<ProjectTreeItem> = Vec::new();

    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        let file_type = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if !file_type.is_dir() {
            continue;
        }

        let entry_name = entry.file_name().to_string_lossy().to_string();
        if entry_name.starts_with('.') || entry_name.eq_ignore_ascii_case("templates") {
            continue;
        }

        let project_path = entry.path();
        if assert_inside_root(data_dir, &project_path).is_err() {
            continue;
        }

        let proj_metadata = entry.metadata().await;
        let mut latest_updated_at = proj_metadata
            .ok()
            .and_then(|m| m.modified().ok())
            .map(format_system_time)
            .unwrap_or_else(|| Utc::now().to_rfc3339());

        let mut note_entries = match tokio::fs::read_dir(&project_path).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        let mut notes: Vec<NoteMeta> = Vec::new();

        while let Ok(Some(note_entry)) = note_entries.next_entry().await {
            let n_type = match note_entry.file_type().await {
                Ok(ft) => ft,
                Err(_) => continue,
            };

            if !n_type.is_file() {
                continue;
            }

            let file_name = note_entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with('.') || !is_supported_note_file(&file_name) {
                continue;
            }

            let note_path = note_entry.path();
            if assert_inside_root(&project_path, &note_path).is_err() {
                continue;
            }

            let stat = match note_entry.metadata().await {
                Ok(s) => s,
                Err(_) => continue,
            };

            let note_updated_at = stat
                .modified()
                .ok()
                .map(format_system_time)
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            if note_updated_at > latest_updated_at {
                latest_updated_at = note_updated_at.clone();
            }

            let note_key = make_note_key(&entry_name, &file_name);
            let is_locked = locked_keys.contains(&note_key);

            let is_md = file_name.to_lowercase().ends_with(".md");
            let mut tags: Option<Vec<String>> = None;
            let mut pinned: Option<bool> = None;
            let mut icon: Option<String> = None;
            let mut color: Option<String> = None;

            if !is_locked {
                if let Ok(raw_content) = tokio::fs::read_to_string(&note_path).await {
                    if is_frontmatter_pinned(&raw_content) {
                        pinned = Some(true);
                    }
                    let (i, c) = extract_note_appearance(&raw_content);
                    icon = i;
                    color = c;
                    if is_md {
                        let extracted_tags = extract_tags_from_markdown(&raw_content);
                        if !extracted_tags.is_empty() {
                            tags = Some(extracted_tags);
                        }
                    }
                }
            }

            notes.push(NoteMeta {
                name: file_name.clone(),
                title: strip_md_extension(&file_name),
                project: entry_name.clone(),
                updated_at: note_updated_at,
                size: stat.len(),
                tags,
                pinned,
                icon,
                color,
                is_locked: if is_locked { Some(true) } else { None },
            });
        }

        notes.sort_by(|a, b| turkish_collate_cmp(&a.title, &b.title));

        let app = project_appearances.get(&entry_name);

        projects.push(ProjectTreeItem {
            name: entry_name,
            note_count: notes.len(),
            updated_at: latest_updated_at,
            icon: app.and_then(|a| a.icon.clone()),
            color: app.and_then(|a| a.color.clone()),
            notes,
        });
    }

    projects.sort_by(|a, b| turkish_collate_cmp(&a.name, &b.name));

    Ok(projects)
}

/// Creates a new project folder with optional appearance configuration.
pub async fn create_project(
    data_dir: &Path,
    raw_name: &str,
    raw_appearance: Option<(&str, &str)>,
) -> Result<ProjectTreeItem, VaultError> {
    let (project_name, project_path) = resolve_project_path(data_dir, raw_name).await?;

    if tokio::fs::try_exists(&project_path).await.unwrap_or(false) {
        return Err(VaultError::conflict(format!(
            "\"{}\" adlı proje zaten mevcut.",
            project_name
        )));
    }

    tokio::fs::create_dir(&project_path)
        .await
        .map_err(|e| VaultError::internal(format!("Proje oluşturulamadı: {}", e)))?;

    let stat = tokio::fs::metadata(&project_path)
        .await
        .map_err(|e| VaultError::internal(format!("Proje bilgileri alınamadı: {}", e)))?;

    let norm_icon = raw_appearance.and_then(|(i, _)| normalize_note_icon_id(i));
    let norm_color = raw_appearance.and_then(|(_, c)| normalize_note_color_id(c));

    if norm_icon.is_some() || norm_color.is_some() {
        set_project_appearance(
            data_dir,
            &project_name,
            ProjectAppearance {
                icon: norm_icon.clone(),
                color: norm_color.clone(),
            },
        )
        .await;
    }

    Ok(ProjectTreeItem {
        name: project_name,
        note_count: 0,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        icon: norm_icon,
        color: norm_color,
        notes: Vec::new(),
    })
}

/// Updates project appearance (icon and/or color) and returns the updated metadata object.
pub async fn update_project_appearance(
    data_dir: &Path,
    raw_project: &str,
    raw_icon: Option<&str>,
    raw_color: Option<&str>,
) -> Result<serde_json::Value, VaultError> {
    let (project_name, project_path) = resolve_project_path(data_dir, raw_project).await?;

    if !project_path.is_dir() {
        return Err(VaultError::not_found("Proje klasörü bulunamadı."));
    }

    let norm_icon = raw_icon.map(normalize_note_icon_id);
    let next_icon = match norm_icon {
        None => None,
        Some(None) => Some(None),
        Some(Some(ic)) => Some(Some(ic)),
    };

    let norm_color = raw_color.map(normalize_note_color_id);
    let next_color = match norm_color {
        None => None,
        Some(None) => Some(None),
        Some(Some(col)) => Some(Some(col)),
    };

    let saved = set_project_appearance(
        data_dir,
        &project_name,
        ProjectAppearanceUpdate {
            icon: next_icon,
            color: next_color,
        },
    )
    .await;

    Ok(serde_json::json!({
        "name": project_name,
        "icon": saved.icon,
        "color": saved.color,
    }))
}

/// Renames a project folder and relocates any associated locks and appearance metadata.
pub async fn rename_project(
    data_dir: &Path,
    raw_current: &str,
    raw_new: &str,
) -> Result<(String, String), VaultError> {
    let (current_name, current_path) = resolve_project_path(data_dir, raw_current).await?;
    let (new_name, new_path) = resolve_project_path(data_dir, raw_new).await?;

    if !current_path.is_dir() {
        return Err(VaultError::not_found("Proje klasörü bulunamadı."));
    }

    if current_name == new_name {
        return Ok((current_name, new_name));
    }

    if tokio::fs::try_exists(&new_path).await.unwrap_or(false) {
        return Err(VaultError::conflict(format!(
            "\"{}\" adlı proje zaten mevcut.",
            new_name
        )));
    }

    tokio::fs::rename(&current_path, &new_path)
        .await
        .map_err(|e| VaultError::internal(format!("Proje yeniden adlandırılamadı: {}", e)))?;

    relocate_project_locks(data_dir, &current_name, &new_name).await;
    relocate_project_appearance(data_dir, &current_name, &new_name).await;

    Ok((current_name, new_name))
}

/// Permanently deletes a project folder and removes all its note locks.
pub async fn delete_project(data_dir: &Path, raw_name: &str) -> Result<(), VaultError> {
    let (project_name, project_path) = resolve_project_path(data_dir, raw_name).await?;

    if !project_path.is_dir() {
        return Err(VaultError::not_found("Proje klasörü bulunamadı."));
    }

    tokio::fs::remove_dir_all(&project_path)
        .await
        .map_err(|e| VaultError::internal(format!("Proje silinemedi: {}", e)))?;

    delete_project_locks(data_dir, &project_name).await;

    Ok(())
}

/// Reads a note document content and metadata.
pub async fn read_note(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
) -> Result<NoteDocument, VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.note_path.is_file() {
        return Err(VaultError::not_found("Not dosyası bulunamadı."));
    }

    let content = tokio::fs::read_to_string(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not okunamadı: {}", e)))?;

    let stat = tokio::fs::metadata(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let pinned = is_frontmatter_pinned(&content);
    let (icon, color) = extract_note_appearance(&content);

    Ok(NoteDocument {
        project: resolved.project_name,
        name: resolved.note_name.clone(),
        title: strip_md_extension(&resolved.note_name),
        content,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        pinned: if pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: None,
    })
}

/// Creates a new note in the specified project with optional content and appearance metadata.
pub async fn create_note(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
    content: Option<&str>,
    raw_appearance: Option<(&str, &str)>,
) -> Result<NoteDocument, VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.project_path.is_dir() {
        return Err(VaultError::not_found("Hedef proje klasörü bulunamadı."));
    }

    if tokio::fs::try_exists(&resolved.note_path).await.unwrap_or(false) {
        return Err(VaultError::conflict(format!(
            "\"{}\" adlı not zaten mevcut.",
            resolved.note_name
        )));
    }

    let title = strip_md_extension(&resolved.note_name);
    let is_txt = resolved.note_name.to_lowercase().ends_with(".txt");

    let mut final_content = match content {
        Some(c) => c.to_string(),
        None => {
            if is_txt {
                format!("{}\n\n", title)
            } else {
                format!("# {}\n\n", title)
            }
        }
    };

    if !is_txt {
        let norm_icon = raw_appearance.and_then(|(i, _)| normalize_note_icon_id(i));
        let norm_color = raw_appearance.and_then(|(_, c)| normalize_note_color_id(c));
        if norm_icon.is_some() || norm_color.is_some() {
            final_content = set_frontmatter_appearance(
                &final_content,
                norm_icon.as_deref(),
                norm_color.as_deref(),
            );
        }
    }

    tokio::fs::write(&resolved.note_path, &final_content)
        .await
        .map_err(|e| VaultError::internal(format!("Not kaydedilemedi: {}", e)))?;

    let stat = tokio::fs::metadata(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let pinned = is_frontmatter_pinned(&final_content);
    let (icon, color) = extract_note_appearance(&final_content);

    Ok(NoteDocument {
        project: resolved.project_name,
        name: resolved.note_name,
        title,
        content: final_content,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        pinned: if pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: None,
    })
}

/// Overwrites a note file with updated content.
pub async fn save_note(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
    content: &str,
) -> Result<NoteDocument, VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.note_path.is_file() {
        return Err(VaultError::not_found("Kaydedilecek not dosyası bulunamadı."));
    }

    tokio::fs::write(&resolved.note_path, content)
        .await
        .map_err(|e| VaultError::internal(format!("Not kaydedilemedi: {}", e)))?;

    let stat = tokio::fs::metadata(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let pinned = is_frontmatter_pinned(content);
    let (icon, color) = extract_note_appearance(content);

    Ok(NoteDocument {
        project: resolved.project_name,
        name: resolved.note_name.clone(),
        title: strip_md_extension(&resolved.note_name),
        content: content.to_string(),
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        pinned: if pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: None,
    })
}

/// Updates the pinned state in a note's frontmatter and saves the file.
pub async fn set_note_pinned(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
    pinned: bool,
) -> Result<(NoteMeta, String), VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.note_path.is_file() {
        return Err(VaultError::not_found("Not dosyası bulunamadı."));
    }

    let current_content = tokio::fs::read_to_string(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not okunamadı: {}", e)))?;

    let next_content = set_frontmatter_pinned(&current_content, pinned);

    tokio::fs::write(&resolved.note_path, &next_content)
        .await
        .map_err(|e| VaultError::internal(format!("Not kaydedilemedi: {}", e)))?;

    let stat = tokio::fs::metadata(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let is_md = resolved.note_name.to_lowercase().ends_with(".md");
    let tags = if is_md {
        extract_tags_from_markdown(&next_content)
    } else {
        Vec::new()
    };
    let (icon, color) = extract_note_appearance(&next_content);
    let is_pinned = is_frontmatter_pinned(&next_content);

    let note_meta = NoteMeta {
        name: resolved.note_name.clone(),
        title: strip_md_extension(&resolved.note_name),
        project: resolved.project_name,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        tags: if tags.is_empty() { None } else { Some(tags) },
        pinned: if is_pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: None,
    };

    Ok((note_meta, next_content))
}

/// Updates the icon and/or color appearance in a note's frontmatter and saves the file.
pub async fn set_note_appearance(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
    raw_icon: Option<&str>,
    raw_color: Option<&str>,
) -> Result<(NoteMeta, String), VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.note_path.is_file() {
        return Err(VaultError::not_found("Not dosyası bulunamadı."));
    }

    let current_content = tokio::fs::read_to_string(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not okunamadı: {}", e)))?;

    let norm_icon = raw_icon.map(normalize_note_icon_id);
    let patch_icon: Option<Option<&str>> = match norm_icon {
        None => None,
        Some(None) => Some(None),
        Some(Some(ref ic)) => Some(Some(ic.as_str())),
    };

    let norm_color = raw_color.map(normalize_note_color_id);
    let patch_color: Option<Option<&str>> = match norm_color {
        None => None,
        Some(None) => Some(None),
        Some(Some(ref col)) => Some(Some(col.as_str())),
    };

    let next_content = patch_frontmatter_appearance(&current_content, patch_icon, patch_color);

    tokio::fs::write(&resolved.note_path, &next_content)
        .await
        .map_err(|e| VaultError::internal(format!("Not kaydedilemedi: {}", e)))?;

    let stat = tokio::fs::metadata(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let is_md = resolved.note_name.to_lowercase().ends_with(".md");
    let tags = if is_md {
        extract_tags_from_markdown(&next_content)
    } else {
        Vec::new()
    };
    let (icon, color) = extract_note_appearance(&next_content);
    let is_pinned = is_frontmatter_pinned(&next_content);

    let note_meta = NoteMeta {
        name: resolved.note_name.clone(),
        title: strip_md_extension(&resolved.note_name),
        project: resolved.project_name,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        tags: if tags.is_empty() { None } else { Some(tags) },
        pinned: if is_pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: None,
    };

    Ok((note_meta, next_content))
}

/// Renames a note file within the same project, relocating any lock password.
pub async fn rename_note(
    data_dir: &Path,
    raw_project: &str,
    raw_current: &str,
    raw_new: &str,
) -> Result<NoteMeta, VaultError> {
    let current = resolve_note_path(data_dir, raw_project, raw_current).await?;
    let next = resolve_note_path(data_dir, raw_project, raw_new).await?;

    if !current.note_path.is_file() {
        return Err(VaultError::not_found("Not dosyası bulunamadı."));
    }

    if current.note_name != next.note_name {
        if tokio::fs::try_exists(&next.note_path).await.unwrap_or(false) {
            return Err(VaultError::conflict(format!(
                "\"{}\" adlı not zaten mevcut.",
                next.note_name
            )));
        }

        tokio::fs::rename(&current.note_path, &next.note_path)
            .await
            .map_err(|e| VaultError::internal(format!("Not yeniden adlandırılamadı: {}", e)))?;

        relocate_note_lock(
            data_dir,
            &current.project_name,
            &current.note_name,
            &next.project_name,
            &next.note_name,
        )
        .await;
    }

    let stat = tokio::fs::metadata(&next.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let locked_keys = list_locked_note_keys(data_dir).await;
    let is_locked = locked_keys.contains(&make_note_key(&next.project_name, &next.note_name));

    let (tags, pinned, icon, color) = if !is_locked {
        if let Ok(content) = tokio::fs::read_to_string(&next.note_path).await {
            let is_md = next.note_name.to_lowercase().ends_with(".md");
            let t = if is_md {
                extract_tags_from_markdown(&content)
            } else {
                Vec::new()
            };
            let (i, c) = extract_note_appearance(&content);
            let p = is_frontmatter_pinned(&content);
            (t, p, i, c)
        } else {
            (Vec::new(), false, None, None)
        }
    } else {
        (Vec::new(), false, None, None)
    };

    Ok(NoteMeta {
        name: next.note_name.clone(),
        title: strip_md_extension(&next.note_name),
        project: next.project_name,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        tags: if tags.is_empty() { None } else { Some(tags) },
        pinned: if pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: if is_locked { Some(true) } else { None },
    })
}

/// Moves a note from one project to another, relocating any lock password.
pub async fn move_note(
    data_dir: &Path,
    raw_from: &str,
    raw_note: &str,
    raw_to: &str,
) -> Result<NoteMeta, VaultError> {
    let source = resolve_note_path(data_dir, raw_from, raw_note).await?;
    let dest = resolve_note_path(data_dir, raw_to, &source.note_name).await?;

    if !source.note_path.is_file() {
        return Err(VaultError::not_found("Taşınacak not dosyası bulunamadı."));
    }

    if !dest.project_path.is_dir() {
        return Err(VaultError::not_found("Hedef proje klasörü bulunamadı."));
    }

    if source.project_name != dest.project_name {
        if tokio::fs::try_exists(&dest.note_path).await.unwrap_or(false) {
            return Err(VaultError::conflict(format!(
                "\"{}\" klasöründe \"{}\" adlı bir not zaten mevcut.",
                dest.project_name, dest.note_name
            )));
        }

        tokio::fs::rename(&source.note_path, &dest.note_path)
            .await
            .map_err(|e| VaultError::internal(format!("Not taşınamadı: {}", e)))?;

        relocate_note_lock(
            data_dir,
            &source.project_name,
            &source.note_name,
            &dest.project_name,
            &dest.note_name,
        )
        .await;
    }

    let stat = tokio::fs::metadata(&dest.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not bilgileri okunamadı: {}", e)))?;

    let locked_keys = list_locked_note_keys(data_dir).await;
    let is_locked = locked_keys.contains(&make_note_key(&dest.project_name, &dest.note_name));

    let (tags, pinned, icon, color) = if !is_locked {
        if let Ok(content) = tokio::fs::read_to_string(&dest.note_path).await {
            let is_md = dest.note_name.to_lowercase().ends_with(".md");
            let t = if is_md {
                extract_tags_from_markdown(&content)
            } else {
                Vec::new()
            };
            let (i, c) = extract_note_appearance(&content);
            let p = is_frontmatter_pinned(&content);
            (t, p, i, c)
        } else {
            (Vec::new(), false, None, None)
        }
    } else {
        (Vec::new(), false, None, None)
    };

    Ok(NoteMeta {
        name: dest.note_name.clone(),
        title: strip_md_extension(&dest.note_name),
        project: dest.project_name,
        updated_at: format_system_time(stat.modified().unwrap_or(std::time::SystemTime::now())),
        size: stat.len(),
        tags: if tags.is_empty() { None } else { Some(tags) },
        pinned: if pinned { Some(true) } else { None },
        icon,
        color,
        is_locked: if is_locked { Some(true) } else { None },
    })
}

/// Permanently deletes a note file and removes its password lock if any.
pub async fn delete_note(
    data_dir: &Path,
    raw_project: &str,
    raw_note: &str,
) -> Result<(), VaultError> {
    let resolved = resolve_note_path(data_dir, raw_project, raw_note).await?;

    if !resolved.note_path.is_file() {
        return Err(VaultError::not_found("Not dosyası bulunamadı."));
    }

    tokio::fs::remove_file(&resolved.note_path)
        .await
        .map_err(|e| VaultError::internal(format!("Not silinemedi: {}", e)))?;

    remove_note_password(data_dir, &resolved.project_name, &resolved.note_name).await;

    Ok(())
}

/// Builds a 140-char search preview snippet and counts query occurrences.
pub fn build_snippet(content: &str, query_lower: &str) -> (String, usize) {
    let mut total_matches = 0;
    let mut snippet_line: Option<String> = None;
    let mut first_non_empty_line: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if first_non_empty_line.is_none() {
            first_non_empty_line = Some(trimmed.to_string());
        }

        let line_lower = trimmed.to_lowercase();
        let count = line_lower.matches(query_lower).count();
        if count > 0 {
            total_matches += count;
            if snippet_line.is_none() {
                snippet_line = Some(trimmed.to_string());
            }
        }
    }

    let raw_snippet = match snippet_line {
        Some(line) => line,
        None => first_non_empty_line.unwrap_or_default(),
    };

    let snippet = if raw_snippet.chars().count() > 140 {
        let truncated: String = raw_snippet.chars().take(140).collect();
        format!("{truncated}…")
    } else {
        raw_snippet
    };

    (snippet, total_matches)
}

/// Searches notes across all vault projects by title and content.
/// If query is empty, returns the 20 most recently modified notes.
/// Otherwise returns up to 50 matching notes sorted by match count and recency.
pub async fn search_notes(
    data_dir: &Path,
    query: &str,
) -> Result<Vec<SearchResultItem>, VaultError> {
    let query_trimmed = query.trim();
    let tree = list_vault_tree(data_dir).await?;

    if query_trimmed.is_empty() {
        let mut recent: Vec<SearchResultItem> = Vec::new();
        for project in &tree {
            for note in &project.notes {
                recent.push(SearchResultItem {
                    project: project.name.clone(),
                    name: note.name.clone(),
                    title: note.title.clone(),
                    updated_at: note.updated_at.clone(),
                    match_type: "title".to_string(),
                    snippet: project.name.clone(),
                    match_count: 0,
                    is_locked: note.is_locked,
                });
            }
        }

        recent.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if recent.len() > 20 {
            recent.truncate(20);
        }
        return Ok(recent);
    }

    let query_lower = query_trimmed.to_lowercase();
    let mut results: Vec<SearchResultItem> = Vec::new();

    for project in &tree {
        for note in &project.notes {
            let title_match = note.title.to_lowercase().contains(&query_lower)
                || project.name.to_lowercase().contains(&query_lower);

            if note.is_locked == Some(true) {
                if title_match {
                    results.push(SearchResultItem {
                        project: project.name.clone(),
                        name: note.name.clone(),
                        title: note.title.clone(),
                        updated_at: note.updated_at.clone(),
                        match_type: "title".to_string(),
                        snippet: format!("{} / {}", project.name, note.title),
                        match_count: 1,
                        is_locked: Some(true),
                    });
                }
                continue;
            }

            let note_path = data_dir.join(&project.name).join(&note.name);
            let content = match tokio::fs::read_to_string(&note_path).await {
                Ok(c) => c,
                Err(_) => String::new(),
            };

            let (snippet, match_count) = build_snippet(&content, &query_lower);
            let content_match = match_count > 0;

            if title_match || content_match {
                let match_type = if title_match && content_match {
                    "both"
                } else if title_match {
                    "title"
                } else {
                    "content"
                };

                let snippet_text = if snippet.is_empty() {
                    format!("{} / {}", project.name, note.title)
                } else {
                    snippet
                };

                let total_matches = match_count + if title_match { 1 } else { 0 };

                results.push(SearchResultItem {
                    project: project.name.clone(),
                    name: note.name.clone(),
                    title: note.title.clone(),
                    updated_at: note.updated_at.clone(),
                    match_type: match_type.to_string(),
                    snippet: snippet_text,
                    match_count: total_matches,
                    is_locked: None,
                });
            }
        }
    }

    results.sort_by(|a, b| {
        b.match_count
            .cmp(&a.match_count)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
    });

    if results.len() > 50 {
        results.truncate(50);
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_validate_safe_name_projects() {
        assert_eq!(validate_safe_name("My Project", "project").unwrap(), "My Project");
        assert_eq!(validate_safe_name("  trimmed  ", "project").unwrap(), "trimmed");

        // empty
        assert!(validate_safe_name("", "project").is_err());
        assert!(validate_safe_name("   ", "project").is_err());

        // invalid characters
        assert!(validate_safe_name("bad/slash", "project").is_err());
        assert!(validate_safe_name("bad\\backslash", "project").is_err());
        assert!(validate_safe_name(".dotstart", "project").is_err());
        assert!(validate_safe_name("dotend.", "project").is_err());
        assert!(validate_safe_name("double..dot", "project").is_err());
        assert!(validate_safe_name("col:on", "project").is_err());

        // Windows reserved
        assert!(validate_safe_name("CON", "project").is_err());
        assert!(validate_safe_name("nul", "project").is_err());
        assert!(validate_safe_name("com1", "project").is_err());

        // templates project name forbidden
        assert!(validate_safe_name("templates", "project").is_err());
        assert!(validate_safe_name("TEMPLATES", "project").is_err());
    }

    #[test]
    fn test_validate_safe_name_notes() {
        assert_eq!(validate_safe_name("Note 1", "note").unwrap(), "Note 1.md");
        assert_eq!(validate_safe_name("Note 1.md", "note").unwrap(), "Note 1.md");
        assert_eq!(validate_safe_name("Note 1.txt", "note").unwrap(), "Note 1.txt");
        assert_eq!(validate_safe_name("Note 1.MD", "note").unwrap(), "Note 1.md");
        assert_eq!(validate_safe_name("Note 1.TXT", "note").unwrap(), "Note 1.txt");

        // empty
        assert!(validate_safe_name("", "note").is_err());
        assert!(validate_safe_name("   ", "note").is_err());

        // invalid characters
        assert!(validate_safe_name("bad/note.md", "note").is_err());
    }

    #[test]
    fn test_turkish_collation() {
        let mut list = vec!["Zeynep", "Ahmet", "Çetin", "Ömer", "Şeyma", "İrem", "Irmak", "Bora"];
        list.sort_by(|a, b| turkish_collate_cmp(a, b));
        assert_eq!(
            list,
            vec!["Ahmet", "Bora", "Çetin", "Irmak", "İrem", "Ömer", "Şeyma", "Zeynep"]
        );
    }

    #[test]
    fn test_build_snippet() {
        let content = "İlk satır.\nBu bir Notika arama testidir.\nÜçüncü satır.";
        let (snippet, count) = build_snippet(content, "notika");
        assert_eq!(count, 1);
        assert_eq!(snippet, "Bu bir Notika arama testidir.");

        let (snippet_none, count_none) = build_snippet(content, "bulunamaz");
        assert_eq!(count_none, 0);
        assert_eq!(snippet_none, "İlk satır.");
    }

    #[tokio::test]
    async fn test_ensure_data_dir_and_starter_notes() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        ensure_data_dir(dir).await.unwrap();
        assert!(dir.join(".notika-seeded").exists());
        assert!(dir.join("Notika").join("01-Hos-Geldiniz.md").exists());
        assert!(dir.join("Notika").join("02-Nasil-Kullanilir.md").exists());
        assert!(dir.join("Notika").join("03-Lisans.md").exists());
        assert!(dir.join("Notika").join("04-Yayincinin-Notu.md").exists());

        let tree = list_vault_tree(dir).await.unwrap();
        assert_eq!(tree.len(), 1);
        assert_eq!(tree[0].name, "Notika");
        assert_eq!(tree[0].notes.len(), 4);
    }

    #[tokio::test]
    async fn test_project_and_note_crud() {
        let temp = tempdir().unwrap();
        let dir = temp.path();

        // 1. Create project
        let proj = create_project(dir, "Test Projesi", Some(("star", "rose")))
            .await
            .unwrap();
        assert_eq!(proj.name, "Test Projesi");
        assert_eq!(proj.icon, Some("star".to_string()));
        assert_eq!(proj.color, Some("rose".to_string()));

        // 2. Create note
        let note = create_note(
            dir,
            "Test Projesi",
            "Ilk Not",
            Some("# Başlık\n\nNot içeriği"),
            None,
        )
        .await
        .unwrap();
        assert_eq!(note.name, "Ilk Not.md");
        assert_eq!(note.title, "Ilk Not");

        // 3. Read note
        let read = read_note(dir, "Test Projesi", "Ilk Not.md").await.unwrap();
        assert_eq!(read.content, "# Başlık\n\nNot içeriği");

        // 4. Save note
        let saved = save_note(dir, "Test Projesi", "Ilk Not.md", "# Güncel\n\nYeni içerik")
            .await
            .unwrap();
        assert_eq!(saved.content, "# Güncel\n\nYeni içerik");

        // 5. Pin note
        let (pinned_meta, _) = set_note_pinned(dir, "Test Projesi", "Ilk Not.md", true)
            .await
            .unwrap();
        assert_eq!(pinned_meta.pinned, Some(true));

        // 6. Rename note
        let renamed = rename_note(dir, "Test Projesi", "Ilk Not.md", "Ikinci Not.md")
            .await
            .unwrap();
        assert_eq!(renamed.name, "Ikinci Not.md");

        // 7. Search notes
        let search = search_notes(dir, "güncel").await.unwrap();
        assert_eq!(search.len(), 1);
        assert_eq!(search[0].title, "Ikinci Not");

        // 8. Delete note
        delete_note(dir, "Test Projesi", "Ikinci Not.md")
            .await
            .unwrap();
        assert!(read_note(dir, "Test Projesi", "Ikinci Not.md").await.is_err());

        // 9. Delete project
        delete_project(dir, "Test Projesi").await.unwrap();
        let tree = list_vault_tree(dir).await.unwrap();
        assert!(tree.is_empty());
    }
}
