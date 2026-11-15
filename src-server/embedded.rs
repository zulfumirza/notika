use axum::{
    http::{header, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
    Router,
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "dist/"]
struct FrontendAssets;

pub fn spa_router() -> Router {
    Router::new().fallback(spa_handler)
}

async fn spa_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let target_path = if path.is_empty() { "index.html" } else { path };

    if let Some(content) = FrontendAssets::get(target_path) {
        let mime = mime_guess::from_path(target_path).first_or_octet_stream();
        let content_type = HeaderValue::from_str(mime.as_ref())
            .unwrap_or(HeaderValue::from_static("application/octet-stream"));
        return ([(header::CONTENT_TYPE, content_type)], content.data).into_response();
    }

    // Fallback to index.html for single-page application (SPA) client-side routing
    if let Some(index) = FrontendAssets::get("index.html") {
        return (
            [(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"))],
            index.data,
        ).into_response();
    }

    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"))],
        "Frontend not found. Please build the client SPA first.",
    ).into_response()
}
