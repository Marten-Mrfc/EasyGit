use crate::commands::git::git_run;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String, // short name, empty if detached
    pub commit: String,
    pub is_main: bool,
    pub locked: bool,
    pub prunable: bool,
}

/// Parse the output of `git worktree list --porcelain`.
/// Each worktree entry is a block of key-value lines separated by blank lines.
fn parse_worktrees(output: &str) -> Vec<WorktreeInfo> {
    let mut result = Vec::new();
    let mut current: Option<WorktreeInfo> = None;
    let mut is_first = true;

    for line in output.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            if let Some(wt) = current.take() {
                result.push(wt);
            }
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            // Flush previous entry if any (shouldn't happen, but be safe)
            if let Some(wt) = current.take() {
                result.push(wt);
            }
            current = Some(WorktreeInfo {
                path: path.to_string(),
                branch: String::new(),
                commit: String::new(),
                is_main: is_first,
                locked: false,
                prunable: false,
            });
            is_first = false;
        } else if let Some(hash) = line.strip_prefix("HEAD ") {
            if let Some(ref mut wt) = current {
                wt.commit = hash[..hash.len().min(8)].to_string();
            }
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            if let Some(ref mut wt) = current {
                // "refs/heads/main" → "main"
                wt.branch = branch_ref
                    .strip_prefix("refs/heads/")
                    .unwrap_or(branch_ref)
                    .to_string();
            }
        } else if line == "locked" || line.starts_with("locked ") {
            if let Some(ref mut wt) = current {
                wt.locked = true;
            }
        } else if line == "prunable" || line.starts_with("prunable ") {
            if let Some(ref mut wt) = current {
                wt.prunable = true;
            }
        }
        // "detached" line — branch stays empty
    }
    // Flush last entry
    if let Some(wt) = current {
        result.push(wt);
    }
    result
}

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let out = git_run(&repo_path, &["worktree", "list", "--porcelain"])?;
    if !out.success && !out.stderr.is_empty() {
        return Err(out.stderr.trim().to_string());
    }
    Ok(parse_worktrees(&out.stdout))
}

#[tauri::command]
pub async fn add_worktree(
    repo_path: String,
    path: String,
    branch: String,
    new_branch: bool,
) -> Result<String, String> {
    let mut args = vec!["worktree", "add"];
    let flag;
    if new_branch {
        flag = "-b".to_string();
        args.push(&flag);
    }
    let path_ref = path.as_str();
    let branch_ref = branch.as_str();
    args.push(path_ref);
    if !branch.is_empty() {
        args.push(branch_ref);
    }
    let args_slice: Vec<&str> = args;
    let out = git_run(&repo_path, &args_slice)?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(format!("Worktree added at {path}"))
}

#[tauri::command]
pub async fn remove_worktree(
    repo_path: String,
    path: String,
    force: bool,
) -> Result<String, String> {
    let path_ref = path.as_str();
    let args: Vec<&str> = if force {
        vec!["worktree", "remove", "--force", path_ref]
    } else {
        vec!["worktree", "remove", path_ref]
    };
    let out = git_run(&repo_path, &args)?;
    if !out.success {
        return Err(format!("{}\n{}", out.stdout, out.stderr).trim().to_string());
    }
    Ok(format!("Worktree removed: {path}"))
}
