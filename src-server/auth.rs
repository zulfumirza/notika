use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::state::AppState;

pub const COOKIE_NAME: &str = "vaultmark_session";
pub const SESSION_TTL_SECONDS: u64 = 60 * 60 * 24 * 7; // 604800 (7 days)

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    pub auth_enabled: bool,
    pub password: String,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPayload {
    pub iat: i64,
    pub exp: i64,
}

/// Retrieves the current auth configuration from `AppState`.
/// Authentication is enabled when `app_password` is configured and non-empty.
pub fn get_auth_config(state: &AppState) -> AuthConfig {
    let (auth_enabled, password) = match &state.app_password {
        Some(pwd) if !pwd.trim().is_empty() => (true, pwd.trim().to_string()),
        _ => (false, String::new()),
    };

    AuthConfig {
        auth_enabled,
        password,
        secret: state.cookie_secret.clone(),
    }
}

/// Verifies input password against the expected password.
/// Computes SHA-256 hash of both strings, then performs a timing-safe
/// comparison via `subtle::ConstantTimeEq`.
pub fn verify_password(input: &str, expected: &str) -> bool {
    let input_hash = Sha256::digest(input.as_bytes());
    let expected_hash = Sha256::digest(expected.as_bytes());
    bool::from(input_hash.ct_eq(&expected_hash))
}

/// Signs an encoded payload string using HMAC-SHA256 with the given secret.
/// Returns the signature encoded as base64url (no padding).
pub fn sign_payload(encoded: &str, secret: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(encoded.as_bytes());
    let result = mac.finalize();
    URL_SAFE_NO_PAD.encode(result.into_bytes())
}

/// Creates a signed session token.
/// Format: `base64url(json({"iat":epoch_secs,"exp":epoch_secs+TTL})).base64url(hmac_sha256(payload,secret))`
pub fn create_session_token(secret: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let payload = SessionPayload {
        iat: now,
        exp: now + SESSION_TTL_SECONDS as i64,
    };

    let json_bytes = serde_json::to_vec(&payload).unwrap_or_default();
    let encoded_payload = URL_SAFE_NO_PAD.encode(json_bytes);
    let signature = sign_payload(&encoded_payload, secret);
    format!("{encoded_payload}.{signature}")
}

/// Verifies a signed session token.
/// Splits on '.', verifies the HMAC signature using timing-safe comparison,
/// decodes the payload, and validates that expiration time (`exp`) > now.
pub fn verify_session_token(token: &str, secret: &str) -> bool {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 2 {
        return false;
    }

    let encoded_payload = parts[0];
    let signature = parts[1];

    if encoded_payload.is_empty() || signature.is_empty() {
        return false;
    }

    let expected_signature = sign_payload(encoded_payload, secret);

    // Timing-safe comparison of signature bytes
    let sig_bytes = signature.as_bytes();
    let expected_bytes = expected_signature.as_bytes();

    if sig_bytes.len() != expected_bytes.len() {
        return false;
    }

    if !bool::from(sig_bytes.ct_eq(expected_bytes)) {
        return false;
    }

    // Decode and parse JSON payload
    let decoded_bytes = match URL_SAFE_NO_PAD.decode(encoded_payload) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };

    let payload: SessionPayload = match serde_json::from_slice(&decoded_bytes) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    payload.exp > now
}

/// Parses the `Cookie` HTTP header into key-value pairs.
/// Splits pairs on ';', then splits each pair on the first '=', trims whitespace,
/// and percent-decodes values.
pub fn parse_cookies(cookie_header: &str) -> HashMap<String, String> {
    let mut cookies = HashMap::new();
    if cookie_header.trim().is_empty() {
        return cookies;
    }

    for pair in cookie_header.split(';') {
        if let Some((key, val)) = pair.split_once('=') {
            let key = key.trim();
            let val = val.trim();
            if !key.is_empty() {
                let decoded = percent_encoding::percent_decode_str(val)
                    .decode_utf8()
                    .map(|cow| cow.into_owned())
                    .unwrap_or_else(|_| val.to_string());
                cookies.insert(key.to_string(), decoded);
            }
        }
    }

    cookies
}

/// Checks whether an incoming request is authenticated.
/// If auth is disabled (`app_password` is empty or None), returns `true`.
/// Otherwise, checks for `vaultmark_session` cookie and verifies its token.
pub fn is_request_authenticated(cookie_header: Option<&str>, state: &AppState) -> bool {
    let config = get_auth_config(state);
    if !config.auth_enabled {
        return true;
    }

    let cookie_str = match cookie_header {
        Some(c) => c,
        None => return false,
    };

    let cookies = parse_cookies(cookie_str);
    let token = match cookies.get(COOKIE_NAME) {
        Some(t) => t,
        None => return false,
    };

    verify_session_token(token, &config.secret)
}

/// Builds the `Set-Cookie` header value for establishing an authenticated session.
/// Format: `vaultmark_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (+ `; Secure` if HTTPS)
pub fn build_session_cookie(token: &str, is_https: bool) -> String {
    if is_https {
        format!("{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}; Secure")
    } else {
        format!("{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}")
    }
}

/// Builds the `Set-Cookie` header value to clear an existing session.
/// Format: `vaultmark_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` (+ `; Secure` if HTTPS)
pub fn build_clear_session_cookie(is_https: bool) -> String {
    if is_https {
        format!("{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure")
    } else {
        format!("{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
    }
}

/// Inspects request headers to determine if the connection was made over HTTPS.
/// Checks `x-forwarded-proto` (including comma-separated lists) and `x-forwarded-ssl`.
pub fn is_https_request(headers: &axum::http::HeaderMap) -> bool {
    if let Some(proto) = headers.get("x-forwarded-proto") {
        if let Ok(proto_str) = proto.to_str() {
            if let Some(first) = proto_str.split(',').next() {
                if first.trim().eq_ignore_ascii_case("https") {
                    return true;
                }
            }
        }
    }
    if let Some(ssl) = headers.get("x-forwarded-ssl") {
        if let Ok(ssl_str) = ssl.to_str() {
            if ssl_str.trim().eq_ignore_ascii_case("on") {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_verify_password() {
        assert!(verify_password("correct-horse-battery-staple", "correct-horse-battery-staple"));
        assert!(!verify_password("wrong-password", "correct-horse-battery-staple"));
        assert!(!verify_password("", "non-empty"));
        assert!(verify_password("", ""));
    }

    #[test]
    fn test_sign_payload_deterministic() {
        let sig1 = sign_payload("test-payload", "supersecret");
        let sig2 = sign_payload("test-payload", "supersecret");
        assert_eq!(sig1, sig2);

        let sig_different = sign_payload("test-payload", "differentsecret");
        assert_ne!(sig1, sig_different);
    }

    #[test]
    fn test_create_and_verify_session_token() {
        let secret = "0123456789abcdef0123456789abcdef";
        let token = create_session_token(secret);

        assert!(verify_session_token(&token, secret));
        assert!(!verify_session_token(&token, "wrongsecret"));
        assert!(!verify_session_token("invalid.token", secret));
        assert!(!verify_session_token("not-a-token", secret));
        assert!(!verify_session_token("", secret));
    }

    #[test]
    fn test_verify_expired_session_token() {
        let secret = "0123456789abcdef0123456789abcdef";
        // Create an expired payload
        let expired_payload = SessionPayload {
            iat: 1000,
            exp: 1001,
        };
        let json_bytes = serde_json::to_vec(&expired_payload).unwrap();
        let encoded_payload = URL_SAFE_NO_PAD.encode(json_bytes);
        let signature = sign_payload(&encoded_payload, secret);
        let expired_token = format!("{encoded_payload}.{signature}");

        assert!(!verify_session_token(&expired_token, secret));
    }

    #[test]
    fn test_parse_cookies() {
        let header = "vaultmark_session=abc123xyz; theme=dark; note_tag=hello%20world; complex=foo=bar";
        let cookies = parse_cookies(header);

        assert_eq!(cookies.get("vaultmark_session"), Some(&"abc123xyz".to_string()));
        assert_eq!(cookies.get("theme"), Some(&"dark".to_string()));
        assert_eq!(cookies.get("note_tag"), Some(&"hello world".to_string()));
        assert_eq!(cookies.get("complex"), Some(&"foo=bar".to_string()));
        assert_eq!(cookies.get("missing"), None);

        let empty = parse_cookies("");
        assert!(empty.is_empty());
    }

    #[test]
    fn test_is_request_authenticated() {
        let secret = "0123456789abcdef0123456789abcdef".to_string();

        // 1. Auth disabled
        let state_disabled = AppState::new(
            PathBuf::from("./data"),
            secret.clone(),
            None,
            None,
        );
        assert!(is_request_authenticated(None, &state_disabled));
        assert!(is_request_authenticated(Some("vaultmark_session=invalid"), &state_disabled));

        // 2. Auth enabled
        let state_enabled = AppState::new(
            PathBuf::from("./data"),
            secret.clone(),
            Some("mypassword".to_string()),
            None,
        );
        // No cookie header
        assert!(!is_request_authenticated(None, &state_enabled));
        // Wrong cookie
        assert!(!is_request_authenticated(Some("other_cookie=value"), &state_enabled));
        // Invalid token
        assert!(!is_request_authenticated(Some("vaultmark_session=invalid.token"), &state_enabled));

        // Valid token
        let token = create_session_token(&secret);
        let cookie_hdr = format!("vaultmark_session={token}");
        assert!(is_request_authenticated(Some(&cookie_hdr), &state_enabled));
    }

    #[test]
    fn test_build_cookies() {
        let token = "test_token_123";

        let session_http = build_session_cookie(token, false);
        assert_eq!(
            session_http,
            "vaultmark_session=test_token_123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"
        );

        let session_https = build_session_cookie(token, true);
        assert_eq!(
            session_https,
            "vaultmark_session=test_token_123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure"
        );

        let clear_http = build_clear_session_cookie(false);
        assert_eq!(
            clear_http,
            "vaultmark_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        );

        let clear_https = build_clear_session_cookie(true);
        assert_eq!(
            clear_https,
            "vaultmark_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure"
        );
    }

    #[test]
    fn test_is_https_request() {
        use axum::http::HeaderMap;

        let mut headers = HeaderMap::new();
        assert!(!is_https_request(&headers));

        headers.insert("x-forwarded-proto", "https".parse().unwrap());
        assert!(is_https_request(&headers));

        headers.insert("x-forwarded-proto", "http".parse().unwrap());
        assert!(!is_https_request(&headers));

        headers.insert("x-forwarded-proto", "https, http".parse().unwrap());
        assert!(is_https_request(&headers));

        let mut ssl_headers = HeaderMap::new();
        ssl_headers.insert("x-forwarded-ssl", "on".parse().unwrap());
        assert!(is_https_request(&ssl_headers));
    }
}
