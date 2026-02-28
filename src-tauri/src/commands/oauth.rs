use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeData {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// Start the GitHub OAuth Device Flow.
/// Returns device_code, user_code, verification_uri, etc.
#[tauri::command]
pub async fn github_start_device_flow(client_id: String) -> Result<DeviceCodeData, String> {
    let client = Client::new();
    let res = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": client_id,
            "scope": "read:user repo"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = body.get("error").and_then(|v| v.as_str()) {
        let desc = body
            .get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or(err);
        return Err(desc.to_string());
    }

    serde_json::from_value(body).map_err(|e| e.to_string())
}

/// Poll GitHub for the access token during Device Flow.
/// Returns Some(token) when authorized, None when still pending.
/// Throws on error (expired, access_denied, etc.).
#[tauri::command]
pub async fn github_poll_device_token(
    client_id: String,
    device_code: String,
) -> Result<Option<String>, String> {
    let client = Client::new();
    let res = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": client_id,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(token) = body.get("access_token").and_then(|v| v.as_str()) {
        return Ok(Some(token.to_string()));
    }

    match body.get("error").and_then(|v| v.as_str()) {
        Some("authorization_pending") | Some("slow_down") => Ok(None),
        Some(e) => {
            let desc = body
                .get("error_description")
                .and_then(|v| v.as_str())
                .unwrap_or(e);
            Err(desc.to_string())
        }
        None => Ok(None),
    }
}
