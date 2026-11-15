use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::auth::is_request_authenticated;
use crate::state::AppState;

/// Axum middleware that enforces authentication on protected routes.
///
/// - If `app_password` is not configured (or empty), authentication is disabled and requests pass through.
/// - Otherwise, checks the `Cookie` header for `vaultmark_session`, verifies the session token and HMAC signature.
/// - If invalid or missing, returns HTTP 401 Unauthorized with JSON error:
///   `{"error": "Bu işlem için oturum açmanız gerekiyor."}`
/// - If valid, forwards the request down the middleware chain with `next.run(req).await`.
///
/// Can be applied to Axum routers using:
/// `axum::middleware::from_fn_with_state(state.clone(), require_auth)`
pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Response {
    let cookie_header = req
        .headers()
        .get(header::COOKIE)
        .and_then(|h| h.to_str().ok());

    if !is_request_authenticated(cookie_header, &state) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Bu işlem için oturum açmanız gerekiyor."
            })),
        )
            .into_response();
    }

    next.run(req).await
}
