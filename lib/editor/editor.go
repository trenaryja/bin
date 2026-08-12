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
	f, err := os.CreateTemp("", fmt.Sprintf("bin-%d-*.txt", time.Now().UnixMilli()))
	if err != nil {
		return ""
	}
	name := f.Name()
	defer func() { _ = os.Remove(name) }()

	// A short write or a failed flush would hand the editor truncated content,
	// which the user would then unknowingly save over their real message.
	_, writeErr := f.WriteString(initial)
	closeErr := f.Close()

	if writeErr != nil || closeErr != nil {
		return ""
	}

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
