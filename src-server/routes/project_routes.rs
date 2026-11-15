use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::state::AppState;

pub async fn list_tree(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let projects = crate::vault::list_vault_tree(&state.data_dir).await?;
    Ok(Json(json!({ "projects": projects })))
}

pub async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), VaultError> {
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let icon = body.get("icon").and_then(|v| v.as_str());
    let color = body.get("color").and_then(|v| v.as_str());

    let appearance = if icon.is_some() || color.is_some() {
        Some((icon.unwrap_or(""), color.unwrap_or("")))
    } else {
        None
    };
    let project = crate::vault::create_project(&state.data_dir, name, appearance).await?;
    Ok((StatusCode::CREATED, Json(json!({ "project": project }))))
}

pub async fn update_project_appearance(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let project = body.get("project").and_then(|v| v.as_str()).unwrap_or("");
    // Present-but-null (or non-string) clears the value; absent leaves it unchanged.
    let icon = body.get("icon").map(|v| v.as_str().unwrap_or(""));
    let color = body.get("color").map(|v| v.as_str().unwrap_or(""));

    let project_item = crate::vault::update_project_appearance(&state.data_dir, project, icon, color).await?;
    Ok(Json(json!({ "project": project_item })))
}

pub async fn rename_project(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let new_name = body.get("newName").and_then(|v| v.as_str()).unwrap_or("");
    // vault::rename_project already relocates locks and appearance metadata.
    let (old_name, new_name) = crate::vault::rename_project(&state.data_dir, &project, new_name).await?;
    if old_name != new_name {
        crate::shares::relocate_share_project_references(&state.data_dir, &old_name, &new_name).await?;
    }

    Ok(Json(json!({
        "oldName": old_name,
        "newName": new_name
    })))
}

pub async fn delete_project(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
) -> Result<Json<Value>, VaultError> {
    let trashed = crate::trash::move_project_to_trash(&state.data_dir, &project).await?;
    crate::shares::delete_shares_for_project(&state.data_dir, &project).await?;
    Ok(Json(json!({ "ok": true, "trashed": trashed })))
}
