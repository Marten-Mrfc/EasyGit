use crate::commands::git::git_run;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,
    pub upstream: Option<String>,
}

#[tauri::command]
pub fn get_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let out = git_run(
        &repo_path,
        &[
            "for-each-ref",
            "--sort=refname",
            "--format=%(HEAD)|%(refname:short)|%(upstream:short)",
            "refs/heads",
        ],
    )?;
    if !out.success {
        return Err(out.stderr);
    }
    let branches = out
        .stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            let current = parts.first().map_or(false, |s| *s == "*");
            let name = parts.get(1).unwrap_or(&"").to_string();
            let upstream = parts
                .get(2)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            BranchInfo {
                name,
                current,
                upstream,
            }
        })
        .collect();
    Ok(branches)
}

#[tauri::command]
pub fn switch_branch(repo_path: String, name: String) -> Result<(), String> {
    let out = git_run(&repo_path, &["switch", &name])?;
    if out.success {
        Ok(())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn create_branch(repo_path: String, name: String, checkout: bool) -> Result<(), String> {
    let out = if checkout {
        git_run(&repo_path, &["switch", "-c", &name])?
    } else {
        git_run(&repo_path, &["branch", &name])?
    };
    if out.success {
        Ok(())
    } else {
        Err(out.stderr)
    }
}

#[tauri::command]
pub fn delete_branch(repo_path: String, name: String, force: bool) -> Result<(), String> {
    let flag = if force { "-D" } else { "-d" };
    let out = git_run(&repo_path, &["branch", flag, &name])?;
    if out.success {
        Ok(())
    } else {
        Err(out.stderr)
    }
}
