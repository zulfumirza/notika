use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultError {
    pub message: String,
    pub status_code: u16,
}

pub type AppError = VaultError;

impl VaultError {
    pub fn new(message: impl Into<String>, status_code: u16) -> Self {
        Self {
            message: message.into(),
            status_code,
        }
    }

    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::new(msg, 400)
    }

    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::new(msg, 401)
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::new(msg, 403)
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new(msg, 404)
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::new(msg, 409)
    }

    pub fn locked(msg: impl Into<String>) -> Self {
        Self::new(msg, 423)
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(msg, 500)
    }
}

impl IntoResponse for VaultError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status_code)
            .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let body = Json(json!({
            "error": self.message,
        }));
        (status, body).into_response()
    }
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "VaultError({}): {}", self.status_code, self.message)
    }
}

impl std::error::Error for VaultError {}

impl From<std::io::Error> for VaultError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => Self::not_found("İstenen dosya veya dizin bulunamadı."),
            std::io::ErrorKind::PermissionDenied => {
                Self::forbidden("Dosya sistemi erişim izni reddedildi.")
            }
            std::io::ErrorKind::AlreadyExists => Self::conflict("Dosya veya dizin zaten mevcut."),
            _ => Self::internal(format!("Dosya sistemi hatası: {}", err)),
        }
    }
}

impl From<serde_json::Error> for VaultError {
    fn from(err: serde_json::Error) -> Self {
        Self::bad_request(format!("JSON ayrıştırma hatası: {}", err))
    }
}
