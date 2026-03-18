// git-ai-commit (Rust) — config embedded at compile time via include_str!
use bin::editor::open_editor;
use bin::git::{commit, get_staged_diff, is_git_repo};
use bin::ollama::{self, Message};
use colored::Colorize;
use dialoguer::{theme::ColorfulTheme, Select};
use indicatif::{ProgressBar, ProgressStyle};
use serde::Deserialize;
use std::process::exit;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    model: String,
    max_diff_chars: usize,
    system_prompt: String,
}

fn load_config() -> Config {
    serde_json::from_str(include_str!("config.json")).expect("Failed to parse config.json")
}

fn generate(config: &Config, diff: &str) -> Result<String, Box<dyn std::error::Error>> {
    ollama::chat(
        &config.model,
        &[
            Message { role: "system", content: config.system_prompt.clone() },
            Message { role: "user", content: format!("Here is the staged diff:\n\n{}", diff) },
        ],
        ollama::OLLAMA_URL,
    )
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
    let mut needs_generation = true;

    loop {
        if needs_generation {
            let spinner = ProgressBar::new_spinner();
            spinner.set_style(
                ProgressStyle::default_spinner()
                    .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
                    .template("{spinner:.blue} {msg}")
                    .unwrap(),
            );
            spinner.set_message(format!("Analyzing staged changes with {}...", config.model));
            spinner.enable_steady_tick(Duration::from_millis(80));

            match generate(&config, &diff) {
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
        }

        println!("\n{}", "─────────────────────────".dimmed());
        println!("{}", message.cyan());
        println!("{}\n", "─────────────────────────".dimmed());

        let selection = Select::with_theme(&theme)
            .with_prompt("What would you like to do?")
            .items(&[
                "Commit with this message",
                "Edit the message (opens $EDITOR)",
                "Regenerate",
                "Cancel",
            ])
            .default(0)
            .interact()
            .unwrap_or(3);

        match selection {
            0 => {
                commit(&message);
                println!("{}", "\n✔ Committed.\n".green());
                break;
            }
            1 => {
                if let Some(edited) = open_editor(&message) {
                    message = edited;
                }
                needs_generation = false;
                continue;
            }
            2 => {
                needs_generation = true;
                continue;
            }
            _ => {
                println!("{}", "\nCancelled.\n".dimmed());
                break;
            }
        }
    }
}
