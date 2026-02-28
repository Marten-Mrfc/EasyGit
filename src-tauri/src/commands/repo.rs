use crate::commands::git::git_run;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStatus {
    pub path: String,
    /// Index (staged) status character: "M", "A", "D", "R", "C", "U", or ""
    pub staged_status: String,
    /// Worktree (unstaged) status character: "M", "D", "?", "U", or ""
    pub unstaged_status: String,
    pub is_staged: bool,
    pub is_unstaged: bool,
    /// Original path for renames (staged rename)
    pub original_path: Option<String>,
}

fn parse_status_line(line: &str) -> Option<FileStatus> {
    if line.len() < 4 {
        return None;
    }
    let x = &line[0..1];
    let y = &line[1..2];
    let xy = &line[0..2];
    let path_part = &line[3..];

    // Handle renames: "new -> old" in porcelain=v1
    let (path, original_path) = if x == "R" || x == "C" {
        if let Some(pos) = path_part.find(" -> ") {
            (
                path_part[..pos].to_string(),
                Some(path_part[pos + 4..].to_string()),
            )
        } else {
            (path_part.to_string(), None)
        }
    } else {
        (path_part.to_string(), None)
    };

    let is_staged = x != " " && x != "?";
    let is_unstaged = y != " " || xy == "??";

    let staged_status = if x == " " || x == "?" {
        "".to_string()
    } else {
        x.to_string()
    };

    let unstaged_status = if xy == "??" {
        "?".to_string()
    } else if y != " " {
        y.to_string()
    } else {
        "".to_string()
    };

    Some(FileStatus {
        path,
        staged_status,
        unstaged_status,
        is_staged,
        is_unstaged,
        original_path,
    })
}

#[tauri::command]
pub fn get_status(repo_path: String) -> Result<Vec<FileStatus>, String> {
    let out = git_run(&repo_path, &["status", "--porcelain=v1", "-u"])?;
    if !out.success && !out.stderr.is_empty() {
        return Err(out.stderr);
    }
    let files = out.stdout.lines().filter_map(parse_status_line).collect();
    Ok(files)
}

#[tauri::command]
pub fn stage_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    let path_refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let mut args = vec!["add", "--"];
    args.extend_from_slice(&path_refs);
    let out = git_run(&repo_path, &args)?;
    if out.success {
        Ok(())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn unstage_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    let path_refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    let mut args = vec!["restore", "--staged", "--"];
    args.extend_from_slice(&path_refs);
    let out = git_run(&repo_path, &args)?;
    if out.success {
        Ok(())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn commit(repo_path: String, message: String) -> Result<String, String> {
    let out = git_run(&repo_path, &["commit", "-m", &message])?;
    if out.success {
        Ok(out.stdout.trim().to_string())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn get_current_branch(repo_path: String) -> Result<String, String> {
    // symbolic-ref works even on brand-new repos with no commits yet
    let out = git_run(&repo_path, &["symbolic-ref", "--short", "HEAD"])?;
    if out.success {
        return Ok(out.stdout.trim().to_string());
    }
    // Detached HEAD — fall back to short hash
    let out2 = git_run(&repo_path, &["rev-parse", "--short", "HEAD"])?;
    if out2.success {
        Ok(format!("(detached:{})", out2.stdout.trim()))
    } else {
        Ok(String::new())
    }
}
