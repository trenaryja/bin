#!/usr/bin/env bun
import { intro, outro, spinner, select, isCancel, cancel, note, text } from "@clack/prompts";
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
  intro("git-ai-commit");

  if (!isGitRepo()) {
    cancel("Not inside a git repository.");
    process.exit(1);
  }

  const diff = getStagedDiff(config.maxDiffChars);
  if (!diff) {
    cancel("No staged changes. Run 'git add' first.");
    process.exit(1);
  }

  while (true) {
    const s = spinner();
    s.start(`Analyzing staged changes with ${config.model}`);

    let message: string;
    try {
      message = await generate(diff);
    } catch (err) {
      s.stop("Failed to reach Ollama. Is it running?");
      cancel(String(err));
      process.exit(1);
    }

    s.stop("Generated commit message");
    note(message, "Proposed commit");

    const action = await select({
      message: "What would you like to do?",
      options: [
        { value: "commit", label: "Commit with this message" },
        { value: "edit", label: "Edit the message" },
        { value: "regenerate", label: "Regenerate" },
        { value: "cancel", label: "Cancel" },
      ],
    });

    if (isCancel(action) || action === "cancel") {
      cancel("Cancelled.");
      process.exit(0);
    }

    if (action === "commit") {
      commit(message);
      outro("Committed.");
      break;
    }

    if (action === "edit") {
      const edited = await text({
        message: "Edit the commit message:",
        initialValue: message,
        validate: (v) => (!v.trim() ? "Message cannot be empty." : undefined),
      });
      if (isCancel(edited)) {
        cancel("Cancelled.");
        process.exit(0);
      }
      commit(edited as string);
      outro("Committed.");
      break;
    }

    // action === "regenerate" — loop continues
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
