import { execSync, spawnSync } from 'child_process'

export function getStagedDiff(maxChars: number): string {
	try {
		const diff = execSync('git diff --staged', { encoding: 'utf8' })
		if (!diff.trim()) return ''
		return diff.length > maxChars ? `${diff.slice(0, maxChars)}\n... (diff truncated)` : diff
	} catch {
		throw new Error('Failed to get staged diff. Are you in a git repo?')
	}
}

export function isGitRepo(): boolean {
	try {
		execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

export function commit(message: string): void {
	const result = spawnSync('git', ['commit', '-m', message], {
		stdio: 'inherit',
	})
	if (result.status !== 0) throw new Error('git commit failed')
}
