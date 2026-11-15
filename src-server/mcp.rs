use std::path::Path;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::error::VaultError;
use crate::locks::is_note_locked;
use crate::models::AppSettings;
use crate::vault::{
    create_note, list_vault_tree, read_note, resolve_note_path, save_note, search_notes,
};

/// Verifies a bearer token from the Authorization header using constant-time comparison
pub fn verify_bearer_token(header_value: Option<&str>, expected: &str) -> bool {
    let header_val = match header_value {
        Some(h) => h.trim(),
        None => return false,
    };

    let parts: Vec<&str> = header_val.split_whitespace().collect();
    if parts.len() != 2 || !parts[0].eq_ignore_ascii_case("bearer") {
        return false;
    }

    let token = parts[1];
    if token.is_empty() || token.len() != expected.len() {
        return false;
    }

    let provided_hash = Sha256::digest(token.as_bytes());
    let expected_hash = Sha256::digest(expected.as_bytes());
    provided_hash.ct_eq(&expected_hash).into()
}

/// Returns metadata information about the MCP server
pub fn get_mcp_info(settings: &AppSettings) -> serde_json::Value {
    serde_json::json!({
        "name": "notika-mcp",
        "version": "1.0.0",
        "protocolVersion": "2024-11-05",
        "enabled": settings.mcp_enabled,
        "transport": "streamable-http-jsonrpc",
        "tools": [
            "list_projects",
            "list_notes",
            "read_note",
            "create_note",
            "update_note",
            "search_notes"
        ]
    })
}

pub fn mcp_tools_list() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "name": "list_projects",
            "description": "Notika içindeki tüm projeleri listeler.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        }),
        serde_json::json!({
            "name": "list_notes",
            "description": "Belirli bir projedeki tüm notları listeler.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Proje klasörünün adı"
                    }
                },
                "required": ["project"],
                "additionalProperties": false
            }
        }),
        serde_json::json!({
            "name": "read_note",
            "description": "Bir notun içeriğini okur.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Notun ait olduğu proje klasörünün adı"
                    },
                    "note": {
                        "type": "string",
                        "description": "Notun dosya adı (.md veya .txt uzantılı)"
                    }
                },
                "required": ["project", "note"],
                "additionalProperties": false
            }
        }),
        serde_json::json!({
            "name": "create_note",
            "description": "Yeni bir not oluşturur.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Notun ekleneceği proje klasörü (yoksa oluşturulur)"
                    },
                    "name": {
                        "type": "string",
                        "description": "Yeni notun adı (.md veya .txt)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Notun başlangıç içeriği"
                    }
                },
                "required": ["project", "name"],
                "additionalProperties": false
            }
        }),
        serde_json::json!({
            "name": "update_note",
            "description": "Mevcut bir notun içeriğini günceller (üzerine yazar).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Notun ait olduğu proje klasörünün adı"
                    },
                    "note": {
                        "type": "string",
                        "description": "Güncellenecek notun dosya adı"
                    },
                    "content": {
                        "type": "string",
                        "description": "Yeni not içeriği"
                    }
                },
                "required": ["project", "note", "content"],
                "additionalProperties": false
            }
        }),
        serde_json::json!({
            "name": "search_notes",
            "description": "Notika genelinde notların başlık ve içeriklerinde arama yapar.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Arama terimi veya anahtar kelime"
                    }
                },
                "required": ["query"],
                "additionalProperties": false
            }
        }),
    ]
}

/// Handles JSON-RPC 2.0 requests for the Model Context Protocol (MCP) as used by `mcp_routes.rs`.
/// Returns Ok(None) for notification methods (HTTP 204 No Content).
pub async fn handle_mcp_request(
    data_dir: &Path,
    body: serde_json::Value,
) -> Result<Option<serde_json::Value>, VaultError> {
    let id = body.get("id").cloned().unwrap_or(serde_json::Value::Null);
    let method = match body.get("method").and_then(|m| m.as_str()) {
        Some(m) => m,
        None => {
            return Ok(Some(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32600,
                    "message": "Geçersiz istek: 'method' alanı eksik."
                }
            })));
        }
    };

    let params = body
        .get("params")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    match method {
        "initialize" => Ok(Some(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false }
                },
                "serverInfo": {
                    "name": "notika-mcp",
                    "version": "1.0.0"
                }
            }
        }))),

        "notifications/initialized" => Ok(None),

        "ping" => Ok(Some(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {}
        }))),

        "tools/list" => Ok(Some(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": mcp_tools_list()
            }
        }))),

        "resources/list" => match list_vault_tree(data_dir).await {
            Ok(tree) => {
                let mut resources = Vec::new();
                for project in tree {
                    for note in project.notes {
                        let encoded_proj = percent_encoding::utf8_percent_encode(
                            &project.name,
                            percent_encoding::NON_ALPHANUMERIC,
                        );
                        let encoded_note = percent_encoding::utf8_percent_encode(
                            &note.name,
                            percent_encoding::NON_ALPHANUMERIC,
                        );
                        let mime_type = if note.name.to_lowercase().ends_with(".txt") {
                            "text/plain"
                        } else {
                            "text/markdown"
                        };
                        resources.push(serde_json::json!({
                            "uri": format!("notika://{}/{}", encoded_proj, encoded_note),
                            "name": format!("{} / {}", project.name, note.title),
                            "mimeType": mime_type
                        }));
                    }
                }
                Ok(Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "resources": resources
                    }
                })))
            }
            Err(e) => Ok(Some(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32000, "message": e.message }
            }))),
        },

        "resources/read" => {
            let uri = params.get("uri").and_then(|u| u.as_str()).unwrap_or("");
            if !uri.starts_with("notika://") {
                return Ok(Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32602,
                        "message": "Geçersiz URI şeması, 'notika://' bekleniyor."
                    }
                })));
            }

            let stripped = &uri["notika://".len()..];
            let (raw_proj, raw_note) = match stripped.split_once('/') {
                Some(pair) => pair,
                None => {
                    return Ok(Some(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {
                            "code": -32602,
                            "message": "Geçersiz notika URI biçimi."
                        }
                    })));
                }
            };

            let project = percent_encoding::percent_decode_str(raw_proj)
                .decode_utf8_lossy()
                .to_string();
            let note = percent_encoding::percent_decode_str(raw_note)
                .decode_utf8_lossy()
                .to_string();

            let resolved = match resolve_note_path(data_dir, &project, &note).await {
                Ok(r) => r,
                Err(e) => {
                    return Ok(Some(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.message }
                    })));
                }
            };

            if is_note_locked(data_dir, &resolved.project_name, &resolved.note_name)
                .await
                .unwrap_or(false)
            {
                return Ok(Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": "Bu not şifre ile kilitlidir." }
                })));
            }

            match read_note(data_dir, &project, &note).await {
                Ok(doc) => {
                    let mime_type = if note.to_lowercase().ends_with(".txt") {
                        "text/plain"
                    } else {
                        "text/markdown"
                    };
                    Ok(Some(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "contents": [
                                {
                                    "uri": uri,
                                    "mimeType": mime_type,
                                    "text": doc.content
                                }
                            ]
                        }
                    })))
                }
                Err(e) => Ok(Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e.message }
                }))),
            }
        }

        "tools/call" => {
            let tool_name = params
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));

            match tool_name {
                "list_projects" => match list_vault_tree(data_dir).await {
                    Ok(tree) => {
                        let projects: Vec<serde_json::Value> = tree
                            .into_iter()
                            .map(|p| {
                                serde_json::json!({
                                    "name": p.name,
                                    "noteCount": p.note_count,
                                    "updatedAt": p.updated_at
                                })
                            })
                            .collect();
                        let text = serde_json::to_string_pretty(&projects).unwrap_or_default();
                        Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "content": [{
                                    "type": "text",
                                    "text": text
                                }]
                            }
                        })))
                    }
                    Err(e) => Ok(Some(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.message }
                    }))),
                },

                "list_notes" => {
                    let project_name = args.get("project").and_then(|v| v.as_str()).unwrap_or("");
                    match list_vault_tree(data_dir).await {
                        Ok(tree) => {
                            let project = tree.into_iter().find(|p| p.name == project_name);
                            let notes = project.map(|p| p.notes).unwrap_or_default();
                            let text = serde_json::to_string_pretty(&notes).unwrap_or_default();
                            Ok(Some(serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": {
                                    "content": [{
                                        "type": "text",
                                        "text": text
                                    }]
                                }
                            })))
                        }
                        Err(e) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.message }
                        }))),
                    }
                }

                "read_note" => {
                    let project = args.get("project").and_then(|v| v.as_str()).unwrap_or("");
                    let note = args.get("note").and_then(|v| v.as_str()).unwrap_or("");

                    match resolve_note_path(data_dir, project, note).await {
                        Ok(resolved) => {
                            if is_note_locked(data_dir, &resolved.project_name, &resolved.note_name)
                                .await
                                .unwrap_or(false)
                            {
                                Ok(Some(serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": id,
                                    "error": {
                                        "code": -32000,
                                        "message": "Bu not şifre ile kilitlidir."
                                    }
                                })))
                            } else {
                                match read_note(data_dir, project, note).await {
                                    Ok(doc) => Ok(Some(serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": {
                                            "content": [{
                                                "type": "text",
                                                "text": doc.content
                                            }]
                                        }
                                    }))),
                                    Err(e) => Ok(Some(serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": { "code": -32000, "message": e.message }
                                    }))),
                                }
                            }
                        }
                        Err(e) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.message }
                        }))),
                    }
                }

                "create_note" => {
                    let project = args.get("project").and_then(|v| v.as_str()).unwrap_or("");
                    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");

                    match create_note(data_dir, project, name, Some(content), None, None).await {
                        Ok(doc) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": {
                                "content": [{
                                    "type": "text",
                                    "text": format!("Oluşturuldu: {}/{}", doc.project, doc.name)
                                }]
                            }
                        }))),
                        Err(e) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.message }
                        }))),
                    }
                }

                "update_note" => {
                    let project = args.get("project").and_then(|v| v.as_str()).unwrap_or("");
                    let note = args.get("note").and_then(|v| v.as_str()).unwrap_or("");
                    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");

                    match resolve_note_path(data_dir, project, note).await {
                        Ok(resolved) => {
                            if is_note_locked(data_dir, &resolved.project_name, &resolved.note_name)
                                .await
                                .unwrap_or(false)
                            {
                                Ok(Some(serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": id,
                                    "error": {
                                        "code": -32000,
                                        "message": "Bu not şifre ile kilitlidir."
                                    }
                                })))
                            } else {
                                match save_note(data_dir, project, note, content).await {
                                    Ok(doc) => Ok(Some(serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "result": {
                                            "content": [{
                                                "type": "text",
                                                "text": format!(
                                                    "Güncellendi: {}/{} ({} byte)",
                                                    doc.project, doc.name, doc.size
                                                )
                                            }]
                                        }
                                    }))),
                                    Err(e) => Ok(Some(serde_json::json!({
                                        "jsonrpc": "2.0",
                                        "id": id,
                                        "error": { "code": -32000, "message": e.message }
                                    }))),
                                }
                            }
                        }
                        Err(e) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.message }
                        }))),
                    }
                }

                "search_notes" => {
                    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    match search_notes(data_dir, query).await {
                        Ok(results) => {
                            let text = serde_json::to_string_pretty(&results).unwrap_or_default();
                            Ok(Some(serde_json::json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": {
                                    "content": [{
                                        "type": "text",
                                        "text": text
                                    }]
                                }
                            })))
                        }
                        Err(e) => Ok(Some(serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.message }
                        }))),
                    }
                }

                _ => Ok(Some(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32601,
                        "message": format!("Bilinmeyen araç: {}", tool_name)
                    }
                }))),
            }
        }

        _ => Ok(Some(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32601,
                "message": format!("Desteklenmeyen yöntem: {}", method)
            }
        }))),
    }
}

/// Alternative handler signature with settings check
pub async fn handle_mcp_request_with_settings(
    body: serde_json::Value,
    data_dir: &Path,
    settings: &AppSettings,
) -> serde_json::Value {
    if !settings.mcp_enabled {
        let id = body.get("id").cloned().unwrap_or(serde_json::Value::Null);
        return serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32001,
                "message": "MCP sunucusu ayarlar üzerinden devre dışı bırakılmış."
            }
        });
    }

    match handle_mcp_request(data_dir, body).await {
        Ok(Some(val)) => val,
        Ok(None) => serde_json::Value::Null,
        Err(e) => serde_json::json!({
            "jsonrpc": "2.0",
            "error": {
                "code": -32603,
                "message": e.message
            }
        }),
    }
}
