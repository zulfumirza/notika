use std::sync::Arc;
use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::state::AppState;

pub async fn list_trash(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let items = crate::trash::list_trash(&state.data_dir).await?;
    Ok(Json(json!({ "items": items })))
}

pub async fn restore_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, VaultError> {
    let result = crate::trash::restore_trash_item(&state.data_dir, &id).await?;
    Ok(Json(json!(result)))
}

pub async fn purge_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, VaultError> {
    crate::trash::purge_trash_item(&state.data_dir, &id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn empty_trash(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    crate::trash::empty_trash(&state.data_dir).await?;
    Ok(Json(json!({ "ok": true })))
}
