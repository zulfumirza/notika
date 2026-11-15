mod auth;
mod embedded;
mod error;
mod locks;
mod mcp;
mod middleware;
mod models;
mod project_meta;
mod routes;
mod shares;
mod state;
mod templates;
mod trash;
mod vault;

use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "3000".into())
        .parse()
        .unwrap_or(3000);

    let data_dir = PathBuf::from(env::var("DATA_DIR").unwrap_or_else(|_| "./data".into()));
    let app_password = env::var("APP_PASSWORD")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let cookie_secret = env::var("AUTH_SECRET")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 16)
        .unwrap_or_else(|| {
            use rand::RngCore;
            let mut bytes = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut bytes);
            hex::encode(bytes)
        });

    let mcp_token = env::var("MCP_TOKEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    vault::ensure_data_dir(&data_dir)
        .await
        .expect("Veri dizini başlatılamadı");

    let state = Arc::new(AppState {
        data_dir: data_dir.clone(),
        cookie_secret,
        app_password,
        mcp_token_env: mcp_token,
    });

    let app = routes::build_api_router(state)
        .merge(embedded::spa_router())
        .layer(tower_http::trace::TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|err| panic!("Sunucu {} adresine bağlanamadı: {}", addr, err));

    println!("Notika sunucusu dinliyor: http://{}", addr);
    println!("Notika veri dizini: {}", data_dir.display());

    axum::serve(listener, app)
        .await
        .expect("Sunucu çalışma hatası");
}
