use rand::RngCore;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Shared application state across all request handlers and services.
#[derive(Debug, Clone)]
pub struct AppState {
    pub data_dir: PathBuf,
    pub cookie_secret: String,  // ephemeral random if not configured
    pub app_password: Option<String>,  // from APP_PASSWORD env
    pub mcp_token_env: Option<String>, // from MCP_TOKEN env
}

impl AppState {
    /// Creates a new `AppState` instance with the specified values.
    pub fn new(
        data_dir: PathBuf,
        cookie_secret: String,
        app_password: Option<String>,
        mcp_token_env: Option<String>,
    ) -> Self {
        Self {
            data_dir,
            cookie_secret,
            app_password,
            mcp_token_env,
        }
    }

    /// Generates 32 random hex bytes (64-character hex string) for ephemeral session signing.
    pub fn generate_cookie_secret() -> String {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    }

    /// Initializes `AppState` from environment variables:
    /// - `DATA_DIR`: Defaults to `./data`
    /// - `AUTH_SECRET`: Used if >= 16 characters; otherwise generates ephemeral 32 random hex bytes
    /// - `APP_PASSWORD`: Non-empty trimmed string enables authentication
    /// - `MCP_TOKEN`: Optional auth token for MCP endpoints
    pub fn from_env() -> Self {
        let data_dir = std::env::var("DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./data"));

        let cookie_secret = match std::env::var("AUTH_SECRET") {
            Ok(secret) if secret.trim().len() >= 16 => secret.trim().to_string(),
            _ => Self::generate_cookie_secret(),
        };

        let app_password = std::env::var("APP_PASSWORD")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let mcp_token_env = std::env::var("MCP_TOKEN")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Self {
            data_dir,
            cookie_secret,
            app_password,
            mcp_token_env,
        }
    }
}
