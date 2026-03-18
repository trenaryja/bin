/**
 * Wraps a CLI main() function with standard error handling:
 * - Inquirer's ExitPromptError (Ctrl+C) exits cleanly with code 0
 * - All other errors are logged and exit with code 1
 */
export const runCLI = (main: () => Promise<void>): void => {
  main().catch((err) => {
    if (err?.name === "ExitPromptError") {
      console.log("\nCancelled.\n");
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
};
