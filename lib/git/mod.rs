use std::process::Command;

pub fn is_git_repo() -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn get_staged_diff(max_chars: usize) -> Option<String> {
    let output = Command::new("git")
        .args(["diff", "--staged"])
        .output()
        .ok()?;
    let diff = String::from_utf8(output.stdout).ok()?;
    if diff.trim().is_empty() {
        return None;
    }
    Some(if diff.len() > max_chars {
        format!("{}\n... (diff truncated)", &diff[..max_chars])
    } else {
        diff
    })
}

pub fn commit(message: &str) {
    let status = Command::new("git")
        .args(["commit", "-m", message])
        .status()
        .expect("Failed to run git commit");
    if !status.success() {
        eprintln!("✖ git commit failed.");
        std::process::exit(1);
    }
}
