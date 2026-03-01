mod cache;
mod commands;

use commands::{
    branch::{create_branch, delete_branch, get_branches, switch_branch},
    diff::{
        clear_diff_cache, get_blame, get_cache_stats, get_commit_diff, get_diff, get_diff_batch,
        get_diff_cached, get_file_content, get_file_log, get_log, invalidate_diff,
        preload_visible_diffs,
    },
    git::git_version,
    oauth::{github_poll_device_token, github_start_device_flow},
    remote::{create_github_repo, fetch, get_remotes, pull, push},
    repo::{
        amend_commit, clone_repo, commit, discard_file_changes, get_current_branch,
        get_last_commit_message, get_status, stage_files, unstage_files,
    },
    stash::{list_stashes, stash_apply, stash_drop, stash_pop, stash_push},
    tags::{
        create_github_release, create_tag, delete_remote_tag, delete_tag,
        generate_github_release_notes, get_commits_since_tag, list_tags, push_tag,
    },
    worktree::{add_worktree, list_worktrees, remove_worktree},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize cache
    cache::init_cache(cache::CacheConfig::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            git_version,
            get_status,
            stage_files,
            unstage_files,
            commit,
            get_current_branch,
            clone_repo,
            get_branches,
            switch_branch,
            create_branch,
            delete_branch,
            push,
            pull,
            fetch,
            get_remotes,
            create_github_repo,
            list_worktrees,
            add_worktree,
            remove_worktree,
            get_diff,
            get_commit_diff,
            get_log,
            get_file_log,
            get_blame,
            get_file_content,
            list_stashes,
            stash_push,
            stash_pop,
            stash_apply,
            stash_drop,
            github_start_device_flow,
            github_poll_device_token,
            list_tags,
            create_tag,
            delete_tag,
            push_tag,
            delete_remote_tag,
            get_commits_since_tag,
            generate_github_release_notes,
            create_github_release,
            discard_file_changes,
            amend_commit,
            get_last_commit_message,
            // ── Phase 1 cache commands ──
            get_diff_cached,
            get_diff_batch,
            preload_visible_diffs,
            clear_diff_cache,
            invalidate_diff,
            get_cache_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
