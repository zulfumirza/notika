use std::sync::Arc;
use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use crate::state::AppState;

pub fn is_https(headers: &HeaderMap) -> bool {
    if let Some(proto) = headers.get("x-forwarded-proto") {
        if let Ok(s) = proto.to_str() {
            if s.split(',').next().unwrap_or("").trim().eq_ignore_ascii_case("https") {
                return true;
            }
        }
    }
    false
}

pub async fn auth_status(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Json<Value> {
    let auth_enabled = state.app_password.is_some();
    let authenticated = if !auth_enabled {
        true
    } else {
        let cookie_header = headers.get(header::COOKIE).and_then(|h| h.to_str().ok());
        crate::auth::is_request_authenticated(cookie_header, &state)
    };

    Json(json!({
        "authEnabled": auth_enabled,
        "authenticated": authenticated
    }))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let Some(ref expected_pw) = state.app_password else {
        return Json(json!({ "ok": true, "authEnabled": false })).into_response();
    };

    let password = body.get("password")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if !crate::auth::verify_password(password, expected_pw) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Girilen şifre hatalı." })),
        ).into_response();
    }

    let token = crate::auth::create_session_token(&state.cookie_secret);
    let cookie = crate::auth::build_session_cookie(&token, is_https(&headers));

    let mut response = Json(json!({ "ok": true, "authEnabled": true })).into_response();
    if let Ok(val) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, val);
    }
    response
}

pub async fn logout(State(_state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    let cookie = crate::auth::build_clear_session_cookie(is_https(&headers));
    let mut response = Json(json!({ "ok": true })).into_response();
    if let Ok(val) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, val);
    }
    response
}
