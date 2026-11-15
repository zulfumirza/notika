use std::collections::HashMap;
use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::routes::auth_routes::is_https;
use crate::state::AppState;

pub async fn public_get_share(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> Result<Json<Value>, VaultError> {
    let unlocked_codes = crate::locks::get_unlocked_share_codes(&headers, &state.cookie_secret);
    let note = crate::shares::resolve_shared_note(&state.data_dir, &code, &unlocked_codes).await?;
    Ok(Json(json!({ "note": note })))
}

pub async fn public_verify_share(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(body): Json<Value>,
) -> Result<Response, VaultError> {
    let password = body.get("password").and_then(|v| v.as_str()).unwrap_or("");
    crate::shares::verify_share_password(&state.data_dir, &code, password).await?;

    let cookie_val = crate::locks::add_unlocked_share_cookie(&headers, &code, &state.cookie_secret, is_https(&headers));
    let mut unlocked_codes = crate::locks::get_unlocked_share_codes(&headers, &state.cookie_secret);
    unlocked_codes.insert(code.clone());

    let note = crate::shares::resolve_shared_note(&state.data_dir, &code, &unlocked_codes).await?;

    let mut response = Json(json!({ "note": note })).into_response();
    if let Ok(hval) = HeaderValue::from_str(&cookie_val) {
        response.headers_mut().insert(header::SET_COOKIE, hval);
    }

    Ok(response)
}

pub async fn public_save_share(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let content = body.get("content").and_then(|v| v.as_str()).ok_or_else(|| {
        VaultError::bad_request("Not içeriği metin formatında olmalıdır.")
    })?;

    let unlocked_codes = crate::locks::get_unlocked_share_codes(&headers, &state.cookie_secret);
    let note = crate::shares::save_shared_note(&state.data_dir, &code, content, &unlocked_codes).await?;
    Ok(Json(json!({ "note": note })))
}

pub async fn list_shares(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, VaultError> {
    let project = params.get("project").map(|s| s.as_str()).unwrap_or("");
    let note = params.get("note").map(|s| s.as_str()).unwrap_or("");

    let shares = crate::shares::list_shares_for_note(&state.data_dir, project, note).await?;
    Ok(Json(json!({ "shares": shares })))
}

pub async fn create_share(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), VaultError> {
    let input = serde_json::from_value::<crate::shares::CreateShareInput>(body)
        .map_err(|e| VaultError::bad_request(format!("Geçersiz paylaşım verisi: {}", e)))?;

    let share = crate::shares::create_share_or_invite(&state.data_dir, input).await?;
    Ok((StatusCode::CREATED, Json(json!({ "share": share }))))
}

pub async fn update_share_permission(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, VaultError> {
    let permission = body.get("permission").and_then(|v| v.as_str()).unwrap_or("read");
    let share = crate::shares::update_share_permission(&state.data_dir, &code, permission).await?;
    Ok(Json(json!({ "share": share })))
}

pub async fn revoke_share(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> Result<Json<Value>, VaultError> {
    crate::shares::revoke_share(&state.data_dir, &code).await?;
    Ok(Json(json!({ "ok": true })))
}
