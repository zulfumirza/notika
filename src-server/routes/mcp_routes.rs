use std::sync::Arc;
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use subtle::ConstantTimeEq;
use crate::error::VaultError;
use crate::state::AppState;

fn verify_bearer_token(auth_header: Option<&str>, active_token: &str) -> bool {
    let Some(header) = auth_header else {
        return false;
    };
    let parts: Vec<&str> = header.split_whitespace().collect();
    if parts.len() != 2 || !parts[0].eq_ignore_ascii_case("bearer") {
        return false;
    }
    let token = parts[1];
    if token.len() != active_token.len() {
        return false;
    }
    token.as_bytes().ct_eq(active_token.as_bytes()).into()
}

pub async fn mcp_info(State(state): State<Arc<AppState>>) -> Result<Json<Value>, VaultError> {
    let settings = crate::shares::get_app_settings(&state.data_dir, state.mcp_token_env.as_deref()).await?;
    let tools = vec![
        "list_projects",
        "list_notes",
        "read_note",
        "create_note",
        "update_note",
        "search_notes",
    ];

    Ok(Json(json!({
        "name": "notika-mcp",
        "version": "1.0.0",
        "protocolVersion": "2024-11-05",
        "enabled": settings.mcp_enabled,
        "transport": "streamable-http-jsonrpc",
        "tools": tools,
    })))
}

pub async fn mcp_handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let id = body.get("id").cloned().unwrap_or(Value::Null);

    let settings = match crate::shares::get_app_settings(&state.data_dir, state.mcp_token_env.as_deref()).await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32603,
                        "message": e.message,
                    },
                    "id": id,
                })),
            ).into_response();
        }
    };

    if !settings.mcp_enabled {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "jsonrpc": "2.0",
                "error": {
                    "code": -32001,
                    "message": "MCP sunucusu ayarlar üzerinden devre dışı bırakılmış.",
                },
                "id": id,
            })),
        ).into_response();
    }

    let active_token = state
        .mcp_token_env
        .as_deref()
        .unwrap_or(&settings.mcp_token);

    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    if !verify_bearer_token(auth_header, active_token) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "jsonrpc": "2.0",
                "error": {
                    "code": -32002,
                    "message": "Geçersiz veya eksik MCP Bearer Token.",
                },
                "id": id,
            })),
        ).into_response();
    }

    match crate::mcp::handle_mcp_request(&state.data_dir, body).await {
        Ok(Some(response_payload)) => Json(response_payload).into_response(),
        Ok(None) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": err.message,
                },
                "id": id,
            })),
        ).into_response(),
    }
}
