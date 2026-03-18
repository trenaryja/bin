#!/usr/bin/env bun
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { chat } from "../lib/ollama";
import { getStagedDiff, isGitRepo, commit } from "../lib/git";
import config from "./config.json";

async function generate(diff: string): Promise<string> {
  return chat(config.ollamaUrl, config.model, [
    { role: "system", content: config.systemPrompt },
    { role: "user", content: `Here is the staged diff:\n\n${diff}` },
  ]);
}

async function main() {
  console.log(chalk.bold("\ngit-ai-commit") + chalk.dim(" (inquirer)\n"));

  if (!isGitRepo()) {
    console.error(chalk.red("✖ Not inside a git repository."));
    process.exit(1);
  }

  const diff = getStagedDiff(config.maxDiffChars);
  if (!diff) {
    console.error(chalk.red("✖ No staged changes. Run 'git add' first."));
    process.exit(1);
  }

  while (true) {
    const spinner = ora(`Analyzing staged changes with ${config.model}`).start();

    let message: string;
    try {
      message = await generate(diff);
      spinner.succeed("Generated commit message");
    } catch (err) {
      spinner.fail("Failed to reach Ollama. Is it running?");
      process.exit(1);
    }

    console.log(chalk.dim("\n  ─────────────────────────"));
    console.log("  " + chalk.cyan(message));
    console.log(chalk.dim("  ─────────────────────────\n"));

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Commit with this message", value: "commit" },
          { name: "Edit the message (opens $EDITOR)", value: "edit" },
          { name: "Regenerate", value: "regenerate" },
          new inquirer.Separator(),
          { name: "Cancel", value: "cancel" },
        ],
      },
    ]);

    if (action === "commit") {
      commit(message);
      console.log(chalk.green("\n✔ Committed.\n"));
      break;
    }

    if (action === "edit") {
      const { edited } = await inquirer.prompt([
        {
          type: "editor",
          name: "edited",
          message: "Edit the commit message (save and close to confirm):",
          default: message,
        },
      ]);
      const trimmed = edited.trim();
      if (!trimmed) {
        console.error(chalk.red("✖ Message cannot be empty."));
        continue;
      }
      commit(trimmed);
      console.log(chalk.green("\n✔ Committed.\n"));
      break;
    }

    if (action === "regenerate") continue;

    console.log(chalk.dim("\nCancelled.\n"));
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
