use std::sync::Arc;
use axum::{extract::State, Json};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::state::AppState;

pub async fn get_settings(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let settings = crate::shares::get_app_settings(&state.data_dir, state.mcp_token_env.as_deref()).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let mcp_enabled = body.get("mcpEnabled").and_then(|v| v.as_bool());
    let settings = crate::shares::update_app_settings(&state.data_dir, mcp_enabled).await?;
    Ok(Json(json!({ "settings": settings })))
}

pub async fn regenerate_mcp_token(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let settings = crate::shares::regenerate_mcp_token(&state.data_dir).await?;
    Ok(Json(json!({ "settings": settings })))
}
