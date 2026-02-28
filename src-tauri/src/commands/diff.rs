use crate::commands::git::git_run;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlameLine {
    pub line_number: u32,
    pub hash: String,
    pub author: String,
    pub date: String,
    pub content: String,
}

fn parse_log_lines(output: &str) -> Vec<CommitInfo> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 5 {
                return None;
            }
            Some(CommitInfo {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                date: parts[3]
                    .split('T')
                    .next()
                    .unwrap_or(parts[3])
                    .to_string(),
                message: parts[4].to_string(),
            })
        })
        .collect()
}

/// Returns the unified diff for a file (staged or unstaged).
#[tauri::command]
pub async fn get_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    let file_ref = file_path.as_str();
    let args: Vec<&str> = if staged {
        vec!["diff", "--staged", "--", file_ref]
    } else {
        vec!["diff", "--", file_ref]
    };
    let out = git_run(&repo_path, &args)?;
    // diff exits 1 when there are changes; that's not an error
    Ok(if out.stdout.is_empty() && staged {
        // Might be a new file added to index — show diff of staged new file
        let out2 = git_run(
            &repo_path,
            &["diff", "--staged", "--diff-filter=A", "--", file_ref],
        )?;
        out2.stdout
    } else {
        out.stdout
    })
}

/// Commit log for the whole repo (recent commits).
#[tauri::command]
pub async fn get_log(
    repo_path: String,
    limit: usize,
) -> Result<Vec<CommitInfo>, String> {
    let limit_str = limit.to_string();
    let out = git_run(
        &repo_path,
        &[
            "log",
            &format!("-n{}", limit_str),
            "--format=%H|%h|%an|%ai|%s",
        ],
    )?;
    if !out.success {
        // Empty repo with no commits – return empty list instead of error
        if out.stderr.contains("does not have any commits")
            || out.stderr.contains("bad default revision")
            || out.stderr.contains("unknown revision")
        {
            return Ok(vec![]);
        }
        return Err(out.stderr.trim().to_string());
    }
    Ok(parse_log_lines(&out.stdout))
}

/// Commit log for a specific file.
#[tauri::command]
pub async fn get_file_log(
    repo_path: String,
    file_path: String,
) -> Result<Vec<CommitInfo>, String> {
    let file_ref = file_path.as_str();
    let out = git_run(
        &repo_path,
        &["log", "-n50", "--follow", "--format=%H|%h|%an|%ai|%s", "--", file_ref],
    )?;
    if !out.success {
        if out.stderr.contains("does not have any commits")
            || out.stderr.contains("bad default revision")
        {
            return Ok(vec![]);
        }
        return Err(out.stderr.trim().to_string());
    }
    Ok(parse_log_lines(&out.stdout))
}

/// Blame a file — returns one entry per line using git's porcelain blame format.
#[tauri::command]
pub async fn get_blame(
    repo_path: String,
    file_path: String,
) -> Result<Vec<BlameLine>, String> {
    let file_ref = file_path.as_str();
    let out = git_run(
        &repo_path,
        &["blame", "--porcelain", file_ref],
    )?;
    if !out.success {
        return Err(out.stderr.trim().to_string());
    }
    Ok(parse_blame_porcelain(&out.stdout))
}

fn parse_blame_porcelain(output: &str) -> Vec<BlameLine> {
    let mut lines = output.lines().peekable();
    let mut result = Vec::new();
    // Track commit metadata we've already seen (hash → (author, date))
    let mut seen: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
    let mut current_hash = String::new();
    let mut current_line_num: u32 = 0;
    let mut current_author = String::new();
    let mut current_date = String::new();

    while let Some(line) = lines.next() {
        // Header line: "<40-char hash> <orig-line> <final-line> [<num>]"
        if line.len() >= 40 && line.chars().take(40).all(|c| c.is_ascii_hexdigit()) {
            let parts: Vec<&str> = line.splitn(4, ' ').collect();
            current_hash = parts[0][..8].to_string();
            current_line_num = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

            if let Some((a, d)) = seen.get(&current_hash) {
                current_author = a.clone();
                current_date = d.clone();
            } else {
                current_author.clear();
                current_date.clear();
            }
        } else if let Some(rest) = line.strip_prefix("author ") {
            current_author = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            // Convert epoch → YYYY-MM-DD
            if let Ok(epoch) = rest.trim().parse::<i64>() {
                // Simple epoch to date (no external crate needed for display)
                current_date = epoch_to_date(epoch);
            }
        } else if let Some(content) = line.strip_prefix('\t') {
            // Store metadata for subsequent references to same commit
            seen.entry(current_hash.clone())
                .or_insert_with(|| (current_author.clone(), current_date.clone()));
            result.push(BlameLine {
                line_number: current_line_num,
                hash: current_hash.clone(),
                author: current_author.clone(),
                date: current_date.clone(),
                content: content.to_string(),
            });
        }
    }
    result
}

/// Very simple epoch → "YYYY-MM-DD" conversion without external crates.
fn epoch_to_date(epoch: i64) -> String {
    // Days since Unix epoch
    let days = (epoch / 86400) as i64;
    // Use the proleptic Gregorian calendar algorithm
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}
