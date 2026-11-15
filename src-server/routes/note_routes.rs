use std::collections::HashMap;
use std::sync::Arc;
use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::routes::auth_routes::is_https;
use crate::state::AppState;

pub async fn get_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, VaultError> {
    let project = params.get("project").map(|s| s.as_str()).unwrap_or("");
    let note = params.get("note").map(|s| s.as_str()).unwrap_or("");

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, note).await?;
    let locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);
    let note_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);

    if locked && !unlocked_keys.contains(&note_key) {
        return Ok((
            StatusCode::LOCKED,
            Json(json!({
                "error": "Bu not şifre ile korunuyor.",
                "locked": true,
                "project": resolved.project_name,
                "name": resolved.note_name
            })),
        ).into_response());
    }

    let mut doc = crate::vault::read_note(&state.data_dir, project, note).await?;
    if locked {
        doc.is_locked = Some(true);
    }

    Ok(Json(json!({ "note": doc })).into_response())
}

pub async fn create_note(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let content = body.get("content").and_then(|v| v.as_str());
    let icon = body.get("icon").and_then(|v| v.as_str());
    let color = body.get("color").and_then(|v| v.as_str());
    let appearance = if icon.is_some() || color.is_some() {
        Some((icon.unwrap_or(""), color.unwrap_or("")))
    } else {
        None
    };

    let note = crate::vault::create_note(&state.data_dir, project, name, content, appearance).await?;
    Ok((StatusCode::CREATED, Json(json!({ "note": note }))))
}

pub async fn save_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let content = body.get("content").and_then(|v| v.as_str()).ok_or_else(|| {
        VaultError::bad_request("Not içeriği metin formatında olmalıdır.")
    })?;

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);
    let note_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);

    if locked && !unlocked_keys.contains(&note_key) {
        return Ok((
            StatusCode::LOCKED,
            Json(json!({
                "error": "Bu notu kaydetmek için önce kilidini açmalısınız.",
                "locked": true
            })),
        ).into_response());
    }

    let mut note = crate::vault::save_note(&state.data_dir, project, name, content).await?;
    if locked {
        note.is_locked = Some(true);
    }

    Ok(Json(json!({ "note": note })).into_response())
}

pub async fn pin_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let pinned = body.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false);

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);
    let note_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);

    if locked && !unlocked_keys.contains(&note_key) {
        return Ok((
            StatusCode::LOCKED,
            Json(json!({
                "error": "Bu notun sabitlenme durumunu değiştirmek için kilidini açmalısınız.",
                "locked": true
            })),
        ).into_response());
    }

    let (mut meta, content) = crate::vault::set_note_pinned(&state.data_dir, project, name, pinned).await?;
    if locked {
        meta.is_locked = Some(true);
    }

    Ok(Json(json!({
        "note": meta,
        "content": content
    })).into_response())
}

pub async fn set_note_appearance(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let icon = body.get("icon").map(|v| v.as_str().unwrap_or(""));
    let color = body.get("color").map(|v| v.as_str().unwrap_or(""));

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);
    let note_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);

    if locked && !unlocked_keys.contains(&note_key) {
        return Ok((
            StatusCode::LOCKED,
            Json(json!({
                "error": "Bu notun görünümünü değiştirmek için kilidini açmalısınız.",
                "locked": true
            })),
        ).into_response());
    }

    let (mut meta, content) = crate::vault::set_note_appearance(&state.data_dir, project, name, icon, color).await?;
    if locked {
        meta.is_locked = Some(true);
    }

    Ok(Json(json!({
        "note": meta,
        "content": content
    })).into_response())
}

pub async fn rename_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let new_name = body.get("newName").and_then(|v| v.as_str()).unwrap_or("");

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let mut note = crate::vault::rename_note(&state.data_dir, project, name, new_name).await?;

    crate::locks::relocate_note_lock(
        &state.data_dir,
        &resolved.project_name,
        &resolved.note_name,
        &note.project,
        &note.name,
    ).await?;
    crate::shares::relocate_share_note_references(
        &state.data_dir,
        &resolved.project_name,
        &resolved.note_name,
        &note.project,
        &note.name,
    ).await?;

    let old_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);

    if locked {
        note.is_locked = Some(true);
    }

    let mut response = Json(json!({ "note": note })).into_response();

    if unlocked_keys.contains(&old_key) {
        let new_key = crate::locks::make_note_key(&note.project, &note.name);
        let cookie_val = crate::locks::add_unlocked_note_cookie(&headers, &new_key, &state.cookie_secret, is_https(&headers));
        if let Ok(hval) = HeaderValue::from_str(&cookie_val) {
            response.headers_mut().insert(header::SET_COOKIE, hval);
        }
    }

    Ok(response)
}

pub async fn move_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let from_project = body.get("fromProject").and_then(|v| v.as_str()).unwrap_or("");
    let note_name = body.get("noteName").and_then(|v| v.as_str()).unwrap_or("");
    let to_project = body.get("toProject").and_then(|v| v.as_str()).unwrap_or("");

    let source = crate::vault::resolve_note_path(&state.data_dir, from_project, note_name).await?;
    let note = crate::vault::move_note(&state.data_dir, from_project, note_name, to_project).await?;

    crate::locks::relocate_note_lock(
        &state.data_dir,
        &source.project_name,
        &source.note_name,
        &note.project,
        &note.name,
    ).await?;
    crate::shares::relocate_share_note_references(
        &state.data_dir,
        &source.project_name,
        &source.note_name,
        &note.project,
        &note.name,
    ).await?;

    let old_key = crate::locks::make_note_key(&source.project_name, &source.note_name);
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);

    let mut response = Json(json!({ "note": note })).into_response();

    if unlocked_keys.contains(&old_key) {
        let new_key = crate::locks::make_note_key(&note.project, &note.name);
        let cookie_val = crate::locks::add_unlocked_note_cookie(&headers, &new_key, &state.cookie_secret, is_https(&headers));
        if let Ok(hval) = HeaderValue::from_str(&cookie_val) {
            response.headers_mut().insert(header::SET_COOKIE, hval);
        }
    }

    Ok(response)
}

pub async fn unlock_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("");

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let valid = crate::locks::verify_note_password(&state.data_dir, &resolved.project_name, &resolved.note_name, password).await?;
    if !valid {
        return Ok((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Not şifresi hatalı." })),
        ).into_response());
    }

    let note_key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);
    let cookie_val = crate::locks::add_unlocked_note_cookie(&headers, &note_key, &state.cookie_secret, is_https(&headers));

    let mut response = Json(json!({ "ok": true })).into_response();
    if let Ok(hval) = HeaderValue::from_str(&cookie_val) {
        response.headers_mut().insert(header::SET_COOKIE, hval);
    }

    Ok(response)
}

pub async fn lock_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("set");

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, name).await?;
    let key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);
    let currently_locked = crate::locks::is_note_locked(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    let unlocked_keys = crate::locks::get_unlocked_note_keys(&headers, &state.cookie_secret);

    if action == "lock-session" {
        if !currently_locked {
            return Err(VaultError::bad_request("Bu notta henüz bir şifre tanımlı değil."));
        }
        let cookie_val = crate::locks::remove_unlocked_note_cookie(&headers, &key, &state.cookie_secret, is_https(&headers));
        let mut response = Json(json!({ "ok": true, "isLocked": true })).into_response();
        if let Some(cookie_str) = cookie_val {
            if let Ok(hval) = HeaderValue::from_str(&cookie_str) {
                response.headers_mut().insert(header::SET_COOKIE, hval);
            }
        }
        return Ok(response);
    }

    if currently_locked && !unlocked_keys.contains(&key) {
        let current_pw = body.get("currentPassword").and_then(|v| v.as_str()).unwrap_or("");
        let ok = crate::locks::verify_note_password(&state.data_dir, &resolved.project_name, &resolved.note_name, current_pw).await?;
        if !ok {
            return Ok((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Mevcut not şifresi hatalı." })),
            ).into_response());
        }
    }

    if action == "remove" {
        crate::locks::remove_note_password(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
        let cookie_val = crate::locks::remove_unlocked_note_cookie(&headers, &key, &state.cookie_secret, is_https(&headers));
        let mut response = Json(json!({ "ok": true, "isLocked": false })).into_response();
        if let Some(cookie_str) = cookie_val {
            if let Ok(hval) = HeaderValue::from_str(&cookie_str) {
                response.headers_mut().insert(header::SET_COOKIE, hval);
            }
        }
        return Ok(response);
    }

    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("");
    if password.is_empty() {
        return Err(VaultError::bad_request("Lütfen geçerli bir şifre girin."));
    }

    crate::locks::set_note_password(&state.data_dir, &resolved.project_name, &resolved.note_name, password).await?;
    let cookie_val = crate::locks::add_unlocked_note_cookie(&headers, &key, &state.cookie_secret, is_https(&headers));

    let mut response = Json(json!({ "ok": true, "isLocked": true })).into_response();
    if let Ok(hval) = HeaderValue::from_str(&cookie_val) {
        response.headers_mut().insert(header::SET_COOKIE, hval);
    }

    Ok(response)
}

pub async fn delete_note(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Response, VaultError> {
    let project = params.get("project").map(|s| s.as_str()).unwrap_or("");
    let note = params.get("note").map(|s| s.as_str()).unwrap_or("");

    let resolved = crate::vault::resolve_note_path(&state.data_dir, project, note).await?;
    let trashed = crate::trash::move_note_to_trash(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;
    crate::shares::delete_shares_for_note(&state.data_dir, &resolved.project_name, &resolved.note_name).await?;

    let key = crate::locks::make_note_key(&resolved.project_name, &resolved.note_name);
    let cookie_val = crate::locks::remove_unlocked_note_cookie(&headers, &key, &state.cookie_secret, is_https(&headers));

    let mut response = Json(json!({ "ok": true, "trashed": trashed })).into_response();
    if let Some(cookie_str) = cookie_val {
        if let Ok(hval) = HeaderValue::from_str(&cookie_str) {
            response.headers_mut().insert(header::SET_COOKIE, hval);
        }
    }

    Ok(response)
}
