use crate::commands::git::git_run;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
    pub commit_hash: String,
    pub date: String,
    pub message: Option<String>,
}

/// List local tags sorted newest-first.
#[tauri::command]
pub fn list_tags(repo_path: String) -> Result<Vec<TagInfo>, String> {
    let out = git_run(
        &repo_path,
        &[
            "tag",
            "-l",
            "--sort=-creatordate",
            "--format=%(refname:short)|%(objectname:short)|%(creatordate:short)|%(contents:subject)",
        ],
    )?;

    let tags = out
        .stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let mut parts = line.splitn(4, '|');
            let name = parts.next().unwrap_or("").trim().to_string();
            let commit_hash = parts.next().unwrap_or("").trim().to_string();
            let date = parts.next().unwrap_or("").trim().to_string();
            let message_raw = parts.next().unwrap_or("").trim().to_string();
            let message = if message_raw.is_empty() {
                None
            } else {
                Some(message_raw)
            };
            TagInfo { name, commit_hash, date, message }
        })
        .collect();

    Ok(tags)
}

/// Create an annotated local tag.
#[tauri::command]
pub fn create_tag(
    repo_path: String,
    name: String,
    message: String,
) -> Result<String, String> {
    git_run(&repo_path, &["tag", "-a", &name, "-m", &message])?;
    Ok(format!("Tag '{}' created", name))
}

/// Delete a local tag.
#[tauri::command]
pub fn delete_tag(repo_path: String, name: String) -> Result<String, String> {
    git_run(&repo_path, &["tag", "-d", &name])?;
    Ok(format!("Tag '{}' deleted", name))
}

/// Push a tag to origin.
#[tauri::command]
pub fn push_tag(repo_path: String, tag_name: String) -> Result<String, String> {
    git_run(&repo_path, &["push", "origin", &tag_name])?;
    Ok(format!("Tag '{}' pushed", tag_name))
}

/// Delete a tag from the remote.
#[tauri::command]
pub fn delete_remote_tag(
    repo_path: String,
    tag_name: String,
) -> Result<String, String> {
    git_run(&repo_path, &["push", "origin", "--delete", &tag_name])?;
    Ok(format!("Remote tag '{}' deleted", tag_name))
}

/// Returns one-line commit messages since the given tag (or the last 100 if no tag).
#[tauri::command]
pub fn get_commits_since_tag(
    repo_path: String,
    tag: Option<String>,
) -> Result<Vec<String>, String> {
    let range = match &tag {
        Some(t) => format!("{}..HEAD", t),
        None => String::new(),
    };

    let mut args = vec!["log", "--oneline", "--no-merges"];
    if !range.is_empty() {
        args.push(&range);
    } else {
        args.extend_from_slice(&["-n", "100"]);
    }

    let out = git_run(&repo_path, &args);
    match out {
        Ok(o) => {
            let lines: Vec<String> = o
                .stdout
                .lines()
                .filter(|l| !l.is_empty())
                .map(|l| l.to_string())
                .collect();
            Ok(lines)
        }
        Err(e) => {
            // Empty repo has no commits
            if e.contains("does not have any commits")
                || e.contains("bad default revision")
                || e.contains("unknown revision")
            {
                Ok(vec![])
            } else {
                Err(e)
            }
        }
    }
}

/// Create a GitHub Release via the REST API.
/// Returns the HTML URL of the created release.
#[tauri::command]
pub async fn create_github_release(
    token: String,
    owner: String,
    repo: String,
    tag_name: String,
    name: String,
    body: String,
    prerelease: bool,
    draft: bool,
) -> Result<String, String> {
    let client = Client::new();

    let payload = serde_json::json!({
        "tag_name": tag_name,
        "name": name,
        "body": body,
        "prerelease": prerelease,
        "draft": draft,
    });

    let resp = client
        .post(format!(
            "https://api.github.com/repos/{}/{}/releases",
            owner, repo
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header(
            "User-Agent",
            "EasyGit/0.1.0 (https://github.com/Marten-Mrfc/EasyGit)",
        )
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API error {}: {}", status, text));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let url = json["html_url"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(url)
}
