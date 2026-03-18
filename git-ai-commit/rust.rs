// git-ai-commit (Rust) — config embedded at compile time via include_str!
use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Editor, Select};
use indicatif::{ProgressBar, ProgressStyle};
use serde::Deserialize;
use serde_json::json;
use std::process::{Command, exit};
use std::time::Duration;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Config {
    ollama_url: String,
    model: String,
    max_diff_chars: usize,
    system_prompt: String,
}

fn load_config() -> Config {
    let raw = include_str!("config.json");
    serde_json::from_str(raw).expect("Failed to parse config.json")
}

fn is_git_repo() -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn get_staged_diff(max_chars: usize) -> Option<String> {
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

fn call_ollama(config: &Config, diff: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "model": config.model,
        "messages": [
            { "role": "system", "content": config.system_prompt },
            { "role": "user", "content": format!("Here is the staged diff:\n\n{}", diff) }
        ],
        "stream": false
    });

    let response = client
        .post(&config.ollama_url)
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()?
        .json::<serde_json::Value>()?;

    let message = response["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Empty response from Ollama")?
        .trim()
        .to_string();

    Ok(message)
}

fn do_commit(message: &str) {
    let status = Command::new("git")
        .args(["commit", "-m", message])
        .status()
        .expect("Failed to run git commit");
    if !status.success() {
        eprintln!("{}", "✖ git commit failed.".red());
        exit(1);
    }
}

fn main() {
    let config = load_config();

    println!("\n{} {}\n", "git-ai-commit".bold(), "(rust)".dimmed());

    if !is_git_repo() {
        eprintln!("{}", "✖ Not inside a git repository.".red());
        exit(1);
    }

    let diff = match get_staged_diff(config.max_diff_chars) {
        Some(d) => d,
        None => {
            eprintln!("{}", "✖ No staged changes. Run 'git add' first.".red());
            exit(1);
        }
    };

    let theme = ColorfulTheme::default();
    let mut message = String::new();

    loop {
        let spinner = ProgressBar::new_spinner();
        spinner.set_style(
            ProgressStyle::default_spinner()
                .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
                .template("{spinner:.blue} {msg}")
                .unwrap(),
        );
        spinner.set_message(format!("Analyzing staged changes with {}...", config.model));
        spinner.enable_steady_tick(Duration::from_millis(80));

        match call_ollama(&config, &diff) {
            Ok(msg) => {
                spinner.finish_and_clear();
                message = msg;
            }
            Err(e) => {
                spinner.finish_and_clear();
                eprintln!("{} {}", "✖ Failed to reach Ollama:".red(), e);
                exit(1);
            }
        }

        println!("\n  {}", "─────────────────────────".dimmed());
        println!("  {}", message.cyan());
        println!("  {}\n", "─────────────────────────".dimmed());

        let options = &[
            "Commit with this message",
            "Edit the message (opens $EDITOR)",
            "Regenerate",
            "Cancel",
        ];
        let selection = Select::with_theme(&theme)
            .with_prompt("What would you like to do?")
            .items(options)
            .default(0)
            .interact()
            .unwrap_or(3);

        match selection {
            0 => {
                do_commit(&message);
                println!("{}", "\n✔ Committed.\n".green());
                break;
            }
            1 => {
                if let Some(edited) = Editor::new().edit(&message).unwrap_or(None) {
                    let trimmed = edited.trim().to_string();
                    if trimmed.is_empty() {
                        eprintln!("{}", "✖ Message cannot be empty.".red());
                        continue;
                    }
                    do_commit(&trimmed);
                    println!("{}", "\n✔ Committed.\n".green());
                    break;
                }
            }
            2 => continue,
            _ => {
                println!("{}", "\nCancelled.\n".dimmed());
                break;
            }
        }
    }
}
