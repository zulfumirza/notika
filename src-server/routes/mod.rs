pub mod auth_routes;
pub mod mcp_routes;
pub mod note_routes;
pub mod project_routes;
pub mod search_routes;
pub mod settings_routes;
pub mod share_routes;
pub mod template_routes;
pub mod trash_routes;

use std::sync::Arc;
use axum::{
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use serde_json::json;
use crate::state::AppState;

pub fn build_api_router(state: Arc<AppState>) -> Router {
    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/health", get(|| async { Json(json!({"ok": true})) }))
        .route("/api/auth/status", get(auth_routes::auth_status))
        .route("/api/auth/login", post(auth_routes::login))
        .route("/api/auth/logout", post(auth_routes::logout))
        .route("/api/public/share/:code", get(share_routes::public_get_share))
        .route("/api/public/share/:code/verify", post(share_routes::public_verify_share))
        .route("/api/public/share/:code", put(share_routes::public_save_share))
        .route("/api/mcp", get(mcp_routes::mcp_info))
        .route("/api/mcp", post(mcp_routes::mcp_handle));

    // Protected routes (require auth middleware)
    let protected_routes = Router::new()
        .route("/api/tree", get(project_routes::list_tree))
        .route("/api/projects", post(project_routes::create_project))
        .route("/api/projects/appearance", post(project_routes::update_project_appearance))
        .route("/api/projects/:project", patch(project_routes::rename_project))
        .route("/api/projects/:project", delete(project_routes::delete_project))
        .route("/api/notes", get(note_routes::get_note))
        .route("/api/notes", post(note_routes::create_note))
        .route("/api/notes", put(note_routes::save_note))
        .route("/api/notes", delete(note_routes::delete_note))
        .route("/api/notes/pin", post(note_routes::pin_note))
        .route("/api/notes/appearance", post(note_routes::set_note_appearance))
        .route("/api/notes/rename", patch(note_routes::rename_note))
        .route("/api/notes/move", post(note_routes::move_note))
        .route("/api/notes/unlock", post(note_routes::unlock_note))
        .route("/api/notes/lock", post(note_routes::lock_note))
        .route("/api/search", get(search_routes::search))
        .route("/api/trash", get(trash_routes::list_trash))
        .route("/api/trash/:id/restore", post(trash_routes::restore_item))
        .route("/api/trash/:id", delete(trash_routes::purge_item))
        .route("/api/trash", delete(trash_routes::empty_trash))
        .route("/api/templates", get(template_routes::list_templates))
        .route("/api/templates", post(template_routes::create_template))
        .route("/api/templates/:name", put(template_routes::update_template))
        .route("/api/templates/:name", delete(template_routes::delete_template))
        .route("/api/shares", get(share_routes::list_shares))
        .route("/api/shares", post(share_routes::create_share))
        .route("/api/shares/:code", patch(share_routes::update_share_permission))
        .route("/api/shares/:code", delete(share_routes::revoke_share))
        .route("/api/settings", get(settings_routes::get_settings))
        .route("/api/settings", patch(settings_routes::update_settings))
        .route("/api/settings/regenerate-mcp-token", post(settings_routes::regenerate_mcp_token))
        .layer(axum::middleware::from_fn_with_state(state.clone(), crate::middleware::auth::require_auth));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        // Match the Express server's `express.json({ limit: '5mb' })` (axum defaults to 2 MB).
        .layer(axum::extract::DefaultBodyLimit::max(5 * 1024 * 1024))
        .with_state(state)
}
