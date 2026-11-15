use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::state::AppState;

pub async fn list_templates(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let templates = crate::templates::list_templates(&state.data_dir).await?;
    Ok(Json(json!({ "templates": templates })))
}

pub async fn create_template(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), VaultError> {
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let content = body.get("content").and_then(|v| v.as_str()).ok_or_else(|| {
        VaultError::bad_request("Şablon içeriği metin olmalıdır.")
    })?;

    let template = crate::templates::create_or_save_template(
        &state.data_dir,
        name,
        content,
        true,
        None,
    ).await?;

    Ok((StatusCode::CREATED, Json(json!({ "template": template }))))
}

pub async fn update_template(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let content = body.get("content").and_then(|v| v.as_str()).ok_or_else(|| {
        VaultError::bad_request("Şablon içeriği metin olmalıdır.")
    })?;

    let new_name = body.get("newName")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let target_name = new_name.unwrap_or(&name);
    let template = crate::templates::create_or_save_template(
        &state.data_dir,
        target_name,
        content,
        false,
        Some(name.as_str()),
    ).await?;

    Ok(Json(json!({ "template": template })))
}

pub async fn delete_template(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<Value>, VaultError> {
    crate::templates::delete_template(&state.data_dir, &name).await?;
    Ok(Json(json!({ "ok": true })))
}
