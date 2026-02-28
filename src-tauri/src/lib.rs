mod commands;

use commands::{
    branch::{create_branch, delete_branch, get_branches, switch_branch},
    diff::{get_blame, get_commit_diff, get_diff, get_file_log, get_log},
    git::git_version,
    oauth::{github_poll_device_token, github_start_device_flow},
    remote::{create_github_repo, fetch, get_remotes, pull, push},
    repo::{commit, get_current_branch, get_status, stage_files, unstage_files},
    stash::{list_stashes, stash_apply, stash_drop, stash_pop, stash_push},
    tags::{
        create_github_release, create_tag, delete_remote_tag, delete_tag,
        generate_github_release_notes, get_commits_since_tag, list_tags, push_tag,
    },
    worktree::{add_worktree, list_worktrees, remove_worktree},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
