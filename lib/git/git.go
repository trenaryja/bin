package git

import (
	"os/exec"
	"strings"
)

func IsGitRepo() bool {
	return exec.Command("git", "rev-parse", "--is-inside-work-tree").Run() == nil
}

func GetStagedDiff(maxChars int) string {
	out, err := exec.Command("git", "diff", "--staged").Output()
	if err != nil {
		return ""
	}
	diff := strings.TrimSpace(string(out))
	if diff == "" || len(diff) <= maxChars {
		return diff
	}
	return diff[:maxChars] + "\n... (diff truncated)"
}

func Commit(message string) error {
	return exec.Command("git", "commit", "-m", message).Run()
}
