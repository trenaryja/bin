//go:build bubbletea

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"bin/lib/git"
	"bin/lib/ollama"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/ollama/ollama/api"
)

//go:embed config.json
var configData []byte

type Config struct {
	Model        ollama.Model `json:"model"`
	MaxDiffChars int          `json:"maxDiffChars"`
	NumCtx       int          `json:"numCtx"`
	SystemPrompt string       `json:"systemPrompt"`
}

var (
	ruleStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	messageStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	cursorStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("212")).Bold(true)
	dimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
)

var menuItems = []string{
	"Commit with this message",
	"Edit the message (opens $EDITOR)",
	"Regenerate",
	"Cancel",
}

type appState int

const (
	stateGenerating appState = iota
	stateReview
)

type model struct {
	appState appState
	cfg      Config
	diff     string
	message  string
	cursor   int
	spinner  spinner.Model
	outcome  string
	err      error
}

type generatedMsg string
type editedMsg string
type errMsg struct{ err error }

func generateCmd(cfg Config, diff string) tea.Cmd {
	return func() tea.Msg {
		msg, err := ollama.Chat(cfg.Model, []api.Message{
			{Role: "system", Content: cfg.SystemPrompt},
			{Role: "user", Content: "Here is the staged diff:\n\n" + diff},
		}, cfg.NumCtx)
		if err != nil {
			return errMsg{err}
		}
		return generatedMsg(msg)
	}
}

func openEditorCmd(current string) tea.Cmd {
	f, _ := os.CreateTemp("", fmt.Sprintf("bin-%d-*.txt", time.Now().UnixMilli()))
	name := f.Name()
	f.WriteString(current)
	f.Close()

	editorEnv := os.Getenv("EDITOR")
	if editorEnv == "" {
		editorEnv = "vi"
	}
	parts := strings.Fields(editorEnv)
	cmd := exec.Command(parts[0], append(parts[1:], name)...)

	return tea.ExecProcess(cmd, func(err error) tea.Msg {
		defer os.Remove(name)
		if err != nil {
			return editedMsg(current)
		}
		content, _ := os.ReadFile(name)
		if trimmed := strings.TrimSpace(string(content)); trimmed != "" {
			return editedMsg(trimmed)
		}
		return editedMsg(current)
	})
}

func newModel(cfg Config, diff string) model {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	return model{appState: stateGenerating, cfg: cfg, diff: diff, spinner: s}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, generateCmd(m.cfg, m.diff))
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.outcome = "cancelled"
			return m, tea.Quit
		case "up", "k":
			if m.appState == stateReview && m.cursor > 0 {
				m.cursor--
			}
		case "down", "j":
			if m.appState == stateReview && m.cursor < len(menuItems)-1 {
				m.cursor++
			}
		case "enter":
			if m.appState != stateReview {
				break
			}
			switch m.cursor {
			case 0:
				if err := git.Commit(m.message); err != nil {
					m.err = err
					m.outcome = "error"
				} else {
					m.outcome = "committed"
				}
				return m, tea.Quit
			case 1:
				return m, openEditorCmd(m.message)
			case 2:
				m.appState = stateGenerating
				m.cursor = 0
				return m, tea.Batch(m.spinner.Tick, generateCmd(m.cfg, m.diff))
			case 3:
				m.outcome = "cancelled"
				return m, tea.Quit
			}
		}

	case generatedMsg:
		m.message = string(msg)
		m.appState = stateReview

	case editedMsg:
		m.message = string(msg)
		m.appState = stateReview

	case errMsg:
		m.err = msg.err
		m.outcome = "error"
		return m, tea.Quit

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}

	return m, nil
}

func (m model) View() string {
	if m.appState == stateGenerating {
		return fmt.Sprintf("\n  %s Analyzing staged changes with %s...\n", m.spinner.View(), m.cfg.Model)
	}

	rule := ruleStyle.Render(strings.Repeat("─", 25))
	var b strings.Builder
	b.WriteString("\n" + rule + "\n")
	b.WriteString(messageStyle.Render(m.message) + "\n")
	b.WriteString(rule + "\n\n")
	b.WriteString("What would you like to do?\n\n")
	for i, item := range menuItems {
		if i == m.cursor {
			b.WriteString(cursorStyle.Render("▸ "+item) + "\n")
		} else {
			b.WriteString(dimStyle.Render("  "+item) + "\n")
		}
	}
	b.WriteString(dimStyle.Render("\n↑/↓  j/k  navigate    enter  select    ctrl+c  quit"))
	return b.String()
}

func main() {
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

	p := tea.NewProgram(newModel(cfg, diff))
	m, err := p.Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	final := m.(model)
	switch final.outcome {
	case "committed":
		fmt.Println("\n✔ Committed.")
	case "error":
		fmt.Fprintln(os.Stderr, "✖", final.err)
		os.Exit(1)
	default:
		fmt.Println("\nCancelled.")
	}
}
