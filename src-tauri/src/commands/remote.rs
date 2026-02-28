use crate::commands::git::git_run;

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
