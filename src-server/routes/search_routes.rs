use std::collections::HashMap;
use std::sync::Arc;
use axum::{
    extract::{Query, State},
    Json,
};
use serde_json::{json, Value};
use crate::error::VaultError;
use crate::state::AppState;

pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, VaultError> {
    let q = params.get("q").map(|s| s.as_str()).unwrap_or("");
    let results = crate::vault::search_notes(&state.data_dir, q).await?;
    Ok(Json(json!({ "results": results })))
}
