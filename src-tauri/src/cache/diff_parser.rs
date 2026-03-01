use crate::cache::models::{ParsedDiff, ParsedFileDiff, ParsedHunk};
use rayon::prelude::*;

fn parse_hunk_lines(hunk_text: &str) -> ParsedHunk {
    let mut header = String::new();
    let mut added_lines = 0usize;
    let mut removed_lines = 0usize;
    let mut context_lines = 0usize;

    for (idx, line) in hunk_text.lines().enumerate() {
        if idx == 0 && line.starts_with("@@") {
            header = line.to_string();
            continue;
        }

        if line.starts_with('+') && !line.starts_with("+++") {
            added_lines += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            removed_lines += 1;
        } else {
            context_lines += 1;
        }
    }

    ParsedHunk {
        header,
        added_lines,
        removed_lines,
        context_lines,
    }
}

fn parse_file_chunk(file_chunk: &str) -> ParsedFileDiff {
    let mut file_path = String::new();

    for line in file_chunk.lines().take(8) {
        if let Some(rest) = line.strip_prefix("+++ b/") {
            file_path = rest.to_string();
            break;
        }
    }

    if file_path.is_empty() {
        file_path = "unknown".to_string();
    }

    let hunks_raw: Vec<&str> = file_chunk
        .split("\n@@")
        .filter(|segment| !segment.trim().is_empty())
        .collect();

    let hunks: Vec<ParsedHunk> = hunks_raw
        .par_iter()
        .map(|segment| {
            let normalized = if segment.starts_with("@@") {
                (*segment).to_string()
            } else {
                format!("@@{}", segment)
            };
            parse_hunk_lines(&normalized)
        })
        .collect();

    let added_lines = hunks.iter().map(|h| h.added_lines).sum();
    let removed_lines = hunks.iter().map(|h| h.removed_lines).sum();

    ParsedFileDiff {
        file_path,
        hunks,
        added_lines,
        removed_lines,
    }
}

pub fn parse_diff_parallel(diff_text: &str) -> ParsedDiff {
    if diff_text.trim().is_empty() {
        return ParsedDiff {
            files: Vec::new(),
            total_files: 0,
            total_hunks: 0,
            total_added_lines: 0,
            total_removed_lines: 0,
        };
    }

    let files_raw: Vec<&str> = diff_text
        .split("diff --git ")
        .filter(|chunk| !chunk.trim().is_empty())
        .collect();

    let files: Vec<ParsedFileDiff> = files_raw
        .par_iter()
        .map(|chunk| parse_file_chunk(chunk))
        .collect();

    let total_hunks = files.iter().map(|f| f.hunks.len()).sum();
    let total_added_lines = files.iter().map(|f| f.added_lines).sum();
    let total_removed_lines = files.iter().map(|f| f.removed_lines).sum();

    ParsedDiff {
        total_files: files.len(),
        files,
        total_hunks,
        total_added_lines,
        total_removed_lines,
    }
}
