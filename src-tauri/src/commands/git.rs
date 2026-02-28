use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub code: i32,
}

/// Run git with the given args rooted at `repo_path`.
/// Passing an empty string for `repo_path` skips `current_dir` (useful for
/// global commands like `git --version`).
/// Returns a structured output even on non-zero exit codes so callers can
/// decide how to surface errors to the frontend.
pub fn git_run(repo_path: &str, args: &[&str]) -> Result<GitOutput, String> {
    let mut cmd = Command::new("git");
    if !repo_path.is_empty() {
        cmd.current_dir(repo_path);
    }
    let output = cmd
        .args(args)
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute git: {}. Is git installed and available in PATH?",
                e
            )
        })?;

    Ok(GitOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        success: output.status.success(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// Tauri command: verify git is available and return its version string.
#[tauri::command]
pub fn git_version() -> Result<String, String> {
    let out = git_run("", &["--version"])?;
    if out.success {
        Ok(out.stdout.trim().to_string())
    } else {
        Err(format!(
            "git exited with code {}: {}",
            out.code, out.stderr
        ))
    }
}
