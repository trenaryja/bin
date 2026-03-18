package editor

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// OpenEditor opens $EDITOR with the initial message pre-populated.
// Returns the edited message, or empty string if cancelled or saved empty.
func OpenEditor(initial string) string {
	f, err := os.CreateTemp("", fmt.Sprintf("bin-tools-%d-*.txt", time.Now().UnixMilli()))
	if err != nil {
		return ""
	}
	name := f.Name()
	defer os.Remove(name)

	f.WriteString(initial)
	f.Close()

	editor := os.Getenv("EDITOR")
	if editor == "" {
		editor = "vi"
	}
	parts := strings.Fields(editor)
	cmd := exec.Command(parts[0], append(parts[1:], name)...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if cmd.Run() != nil {
		return ""
	}

	content, _ := os.ReadFile(name)
	return strings.TrimSpace(string(content))
}
