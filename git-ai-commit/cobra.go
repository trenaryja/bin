//go:build cobra

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"

	"bin/lib/editor"
	"bin/lib/git"
	"bin/lib/ollama"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/spf13/cobra"
)

//go:embed config.json
var configData []byte

type Config struct {
	Model        string `json:"model"`
	MaxDiffChars int    `json:"maxDiffChars"`
	SystemPrompt string `json:"systemPrompt"`
}

func main() {
	cmd := &cobra.Command{
		Use:          "git-ai-commit-cobra",
		Short:        "AI-powered git commit message generator",
		SilenceUsage: true,
		RunE:         run,
	}
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func run(_ *cobra.Command, _ []string) error {
	var cfg Config
	json.Unmarshal(configData, &cfg)

	if !git.IsGitRepo() {
		fmt.Fprintln(os.Stderr, "✖ Not inside a git repository.")
		os.Exit(1)
	}

	diff := git.GetStagedDiff(cfg.MaxDiffChars)
	if diff == "" {
		fmt.Fprintln(os.Stderr, "✖ No staged changes. Run 'git add' first.")
		os.Exit(1)
	}

	var message string
	needsGeneration := true

	for {
		if needsGeneration {
			var genErr error
			spinner.New().
				Title("Analyzing staged changes with " + cfg.Model + "...").
				Action(func() {
					message, genErr = ollama.Chat(cfg.Model, []ollama.Message{
						{Role: "system", Content: cfg.SystemPrompt},
						{Role: "user", Content: "Here is the staged diff:\n\n" + diff},
					}, ollama.OllamaURL)
				}).
				Run()
			if genErr != nil {
				fmt.Fprintln(os.Stderr, "✖ Failed to reach Ollama. Is it running?")
				os.Exit(1)
			}
		}

		fmt.Printf("\n─────────────────────────\n%s\n─────────────────────────\n\n", message)

		var action string
		if err := huh.NewSelect[string]().
			Title("What would you like to do?").
			Options(
				huh.NewOption("Commit with this message", "commit"),
				huh.NewOption("Edit the message (opens $EDITOR)", "edit"),
				huh.NewOption("Regenerate", "regenerate"),
				huh.NewOption("Cancel", "cancel"),
			).
			Value(&action).
			Run(); err != nil {
			fmt.Println("\nCancelled.")
			os.Exit(0)
		}

		switch action {
		case "commit":
			if err := git.Commit(message); err != nil {
				fmt.Fprintln(os.Stderr, "✖ git commit failed:", err)
				os.Exit(1)
			}
			fmt.Println("\n✔ Committed.")
			return nil
		case "edit":
			if edited := editor.OpenEditor(message); edited != "" {
				message = edited
			}
			needsGeneration = false
		case "regenerate":
			needsGeneration = true
		default:
			fmt.Println("\nCancelled.")
			os.Exit(0)
		}
	}
}
