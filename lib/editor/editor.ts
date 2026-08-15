import { spawnSync } from 'child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Opens $EDITOR with the initial message pre-populated.
// Returns the edited message, or null if cancelled (editor closed without saving / Ctrl+C).
export const openEditor = (initial: string): string | null => {
	const tmpFile = join(tmpdir(), `git-ai-commit-${Date.now()}.txt`)
	writeFileSync(tmpFile, initial)

	// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty-string EDITOR should also fall back to vi
	const editor = process.env.EDITOR || 'vi'
	const [cmd, ...args] = editor.split(' ')
	const result = spawnSync(cmd!, [...args, tmpFile], { stdio: 'inherit' })

	try {
		if (result.status !== 0 || result.signal) return null
		const edited = readFileSync(tmpFile, 'utf8').trim()
		return edited || null
	} finally {
		try {
			unlinkSync(tmpFile)
		} catch {
			// best-effort cleanup — ignore errors
		}
	}
}
