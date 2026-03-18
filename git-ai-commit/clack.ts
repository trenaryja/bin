#!/usr/bin/env bun
import { commit, getStagedDiff, isGitRepo, openEditor, runCLI } from "@/lib";
import {
  cancel,
  intro,
  isCancel,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import wrapAnsi from "wrap-ansi";
import config from "./config.json";
import { generate } from "./generate";

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

  let message = "";
  let needsGeneration = true;

  while (true) {
    if (needsGeneration) {
      const s = spinner();
      s.start(`Analyzing staged changes with ${config.model}`);
      try {
        message = await generate(diff);
      } catch (err) {
        s.stop("Failed to reach Ollama. Is it running?");
        cancel(String(err));
        process.exit(1);
      }
      s.stop("Generated commit message");
    }

    const cols = process.stdout.columns ?? 80;
    note(wrapAnsi(message, cols - 6, { hard: false, trim: false }), "Proposed commit");

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
      const edited = openEditor(message);
      if (edited) message = edited;
      needsGeneration = false;
      continue;
    }

    // action === "regenerate"
    needsGeneration = true;
  }
}

runCLI(main);
