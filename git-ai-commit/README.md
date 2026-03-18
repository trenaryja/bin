# git-ai-commit

Generates AI-powered commit messages from staged diffs using a local Ollama model.

This is the **reference implementation** — the same tool built in multiple languages and frameworks to explore each ecosystem's CLI patterns and identify best practices. It is the Hello World for this repo.

## Usage

```bash
git add <files>
git-ai-commit           # Clack (TypeScript) — default
git-ai-commit-inquirer  # Inquirer (TypeScript)
git-ai-commit-rust      # Rust / dialoguer
git-ai-commit-cobra     # Go / Cobra + huh
git-ai-commit-bubbletea # Go / Bubble Tea
```

Requires [Ollama](https://ollama.com) running locally with the configured model pulled.

## Configuration

`config.json` is the shared source of truth across all implementations. It is embedded at compile time in Rust and Go (`//go:embed`, `include_str!`), and imported directly by TypeScript.

| Key            | Default            | Description                                  |
| -------------- | ------------------ | -------------------------------------------- |
| `model`        | `qwen2.5-coder:7b` | Ollama model                                 |
| `maxDiffChars` | `8000`             | Max staged diff characters sent to the model |
| `systemPrompt` | _(see file)_       | System prompt for commit message generation  |

## Progressive CLI (future)

Currently all configuration lives in `config.json` and the tool is fully interactive. The next evolution is **progressive CLI**: every option becomes both a flag and an interactive fallback.

```bash
# Future: flag-driven (AI/script-friendly, no interaction)
git-ai-commit --model llama3.2 --auto-commit

# Future: interactive fallback (human-friendly, same tool)
git-ai-commit  # prompts for anything not provided via flags
```

The goal is to extend `config.json` into a full CLI schema — flag names, short flags, types, descriptions — from which each language's argument parser is derived automatically. One definition, five implementations.

## Implementations

The purpose of multiple implementations is exploration and consistency — not feature comparison. Each should behave identically from the user's perspective.

| Binary                    | Language   | Framework             | Notes                                              |
| ------------------------- | ---------- | --------------------- | -------------------------------------------------- |
| `git-ai-commit`           | TypeScript | Clack                 | Rich TUI, Elm-adjacent feel                        |
| `git-ai-commit-inquirer`  | TypeScript | Inquirer + Ora        | Classic list prompt                                |
| `git-ai-commit-rust`      | Rust       | dialoguer + indicatif | Native binary, 3.5MB                               |
| `git-ai-commit-cobra`     | Go         | Cobra + huh           | Idiomatic Go CLI structure                         |
| `git-ai-commit-bubbletea` | Go         | Bubble Tea            | Elm architecture TUI, `tea.ExecProcess` for editor |

### What was learned

**TypeScript (Clack/Inquirer):** Fastest to iterate. `bun --compile` produces ~58MB binaries because the Bun runtime is embedded. The `lib/` shared utilities (`openEditor`, `runCLI`) eliminate the main pain points. Best for rapid prototyping.

**Rust:** Smallest binaries (3.5MB). Steepest learning curve for prototyping. `include_str!` embeds config at compile time elegantly. Not the right choice for quick iteration but ideal when binary size or performance matters.

**Go (Cobra + huh):** Best balance. 6–9MB binaries. Cobra gives command/flag structure for free — the foundation for progressive CLI. `huh` is the closest Go equivalent to Inquirer. Faster to prototype than Rust.

**Go (Bubble Tea):** Purest TUI experience. Elm architecture (Model/Update/View) forces clean state management. `tea.ExecProcess` is the right way to hand terminal control to an external process (like `$EDITOR`) and resume — cleaner than the blocking approach in other implementations.

### Key cross-language patterns

| Concern           | TypeScript                                 | Rust                          | Go                                                     |
| ----------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| Config embed      | `import config from "./config.json"`       | `include_str!("config.json")` | `//go:embed config.json`                               |
| Editor spawn      | `spawnSync($EDITOR, tmpFile)`              | `Command::new(cmd).status()`  | `tea.ExecProcess` (BubbleTea) / `exec.Command` (Cobra) |
| Ctrl+C handling   | `runCLI` wrapper catches `ExitPromptError` | `unwrap_or(3)` on select      | `tea.Quit` on `ctrl+c`                                 |
| Shared lib import | `import { ... } from "@/lib"`              | `use bin::ollama`             | `"bin/lib"`                                            |
