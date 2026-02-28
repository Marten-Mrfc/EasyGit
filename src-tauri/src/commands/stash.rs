use crate::commands::git::git_run;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashInfo {
    pub index: usize,
    pub reference: String, // "stash@{0}"
    pub message: String,
    pub hash: String,
}

#[tauri::command]
pub async fn list_stashes(repo_path: String) -> Result<Vec<StashInfo>, String> {
    let out = git_run(
        &repo_path,
        &["stash", "list", "--format=%H|%gd|%gs"],
    )?;
    // not an error if there are no stashes
    if !out.success && !out.stderr.trim().is_empty() {
        return Err(out.stderr.trim().to_string());
    }
    let stashes = out
        .stdout
        .lines()
        .enumerate()
        .filter_map(|(i, line)| {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() < 3 {
                return None;
            }
            Some(StashInfo {
                index: i,
                hash: parts[0][..parts[0].len().min(8)].to_string(),
                reference: parts[1].to_string(),
                message: parts[2].to_string(),
            })
        })
        .collect();
    Ok(stashes)
}

#[tauri::command]
pub async fn stash_push(
    repo_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<String, String> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    let msg;
    if let Some(ref m) = message {
        args.push("-m");
        msg = m.as_str();
        args.push(msg);
    }
    let out = git_run(&repo_path, &args)?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(out.stdout.trim().to_string())
}

#[tauri::command]
pub async fn stash_pop(
    repo_path: String,
    index: usize,
) -> Result<String, String> {
    let reference = format!("stash@{{{}}}", index);
    let ref_str = reference.as_str();
    let out = git_run(&repo_path, &["stash", "pop", ref_str])?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(out.stdout.trim().to_string())
}

#[tauri::command]
pub async fn stash_apply(
    repo_path: String,
    index: usize,
) -> Result<String, String> {
    let reference = format!("stash@{{{}}}", index);
    let ref_str = reference.as_str();
    let out = git_run(&repo_path, &["stash", "apply", ref_str])?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(out.stdout.trim().to_string())
}

#[tauri::command]
pub async fn stash_drop(
    repo_path: String,
    index: usize,
) -> Result<String, String> {
    let reference = format!("stash@{{{}}}", index);
    let ref_str = reference.as_str();
    let out = git_run(&repo_path, &["stash", "drop", ref_str])?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(out.stdout.trim().to_string())
}
