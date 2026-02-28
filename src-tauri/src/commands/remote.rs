use crate::commands::git::git_run;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

/// List all configured git remotes for the repo.
#[tauri::command]
pub fn get_remotes(repo_path: String) -> Result<Vec<RemoteInfo>, String> {
    let out = git_run(&repo_path, &["remote", "-v"])?;
    // `git remote -v` prints two lines per remote (fetch + push); deduplicate by name.
    let mut seen = std::collections::HashSet::new();
    let remotes = out
        .stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\t');
            let name = parts.next()?.trim().to_string();
            let rest = parts.next().unwrap_or("");
            // rest = "<url> (fetch)" or "<url> (push)"
            let url = rest.split_whitespace().next().unwrap_or("").to_string();
            if seen.insert(name.clone()) {
                Some(RemoteInfo { name, url })
            } else {
                None
            }
        })
        .collect();
    Ok(remotes)
}

/// Create a new GitHub repository and add it as the `origin` remote.
/// Returns the clone URL of the created repo.
#[tauri::command]
pub async fn create_github_repo(
    repo_path: String,
    token: String,
    name: String,
    private: bool,
    description: Option<String>,
) -> Result<String, String> {
    let client = Client::new();

    // 1. Create repo via GitHub REST API
    let body = serde_json::json!({
        "name": name,
        "private": private,
        "description": description.unwrap_or_default(),
        "auto_init": false,
    });

    let res = client
        .post("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "EasyGit")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        // Try to surface the GitHub error message
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
            .unwrap_or_else(|| format!("HTTP {}: {}", status, text));
        return Err(msg);
    }

    let repo_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let clone_url = repo_json
        .get("clone_url")
        .and_then(|v| v.as_str())
        .ok_or("No clone_url in response")?
        .to_string();

    // 2. Add as origin remote
    let out = git_run(&repo_path, &["remote", "add", "origin", &clone_url])?;
    if !out.success {
        return Err(out.stderr);
    }

    Ok(clone_url)
}

#[tauri::command]
pub fn push(repo_path: String, set_upstream: bool) -> Result<String, String> {
    // git push output goes to stderr even on success, so combine both
    let out = if set_upstream {
        let branch_out = git_run(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        if !branch_out.success {
            return Err(branch_out.stderr);
        }
        let branch = branch_out.stdout.trim().to_string();
        git_run(&repo_path, &["push", "--set-upstream", "origin", &branch])?
    } else {
        git_run(&repo_path, &["push"])?
    };
    if out.success {
        let msg = format!("{}{}", out.stdout.trim(), out.stderr.trim());
        Ok(msg)
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn pull(repo_path: String) -> Result<String, String> {
    let out = git_run(&repo_path, &["pull"])?;
    if out.success {
        Ok(out.stdout.trim().to_string())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn fetch(repo_path: String) -> Result<String, String> {
    let out = git_run(&repo_path, &["fetch", "--all", "--prune"])?;
    if out.success {
        let msg = format!("{}{}", out.stdout.trim(), out.stderr.trim());
        Ok(msg)
    } else {
        Err(out.stderr)
    }
}
