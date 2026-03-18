use std::{env, fs, process::Command};

/// Opens `$EDITOR` with the initial message pre-populated.
/// Returns the edited message, or `None` if cancelled or saved empty.
pub fn open_editor(initial: &str) -> Option<String> {
    let tmp_path = env::temp_dir().join(format!(
        "bin-{}.txt",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));

    fs::write(&tmp_path, initial).ok()?;

    let editor = env::var("EDITOR").unwrap_or_else(|_| "vi".to_string());
    let parts: Vec<&str> = editor.split_whitespace().collect();
    let (cmd, args) = parts.split_first().expect("EDITOR is empty");

    let status = Command::new(cmd).args(args).arg(&tmp_path).status().ok()?;

    let result = if status.success() {
        fs::read_to_string(&tmp_path)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    };

    let _ = fs::remove_file(&tmp_path);
    result
}
