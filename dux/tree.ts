import { spawn } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { dirname, join, resolve as resolvePath } from 'path'

import { z } from 'zod'

// ── Types ────────────────────────────────────────────────────────────────────

export const FileEntrySchema = z.object({
	path: z.string(),
	size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	is_dir: z.boolean(),
})

export type FileEntry = z.infer<typeof FileEntrySchema>

export type TreeNode = {
	name: string
	size: number
	totalSize: number // cached recursive size
	isDir: boolean
	children: Map<string, TreeNode>
	sortedCache?: TreeNode[] // invalidated on insertion
}

export const SCANNER_TIMEOUT_MS = 120_000

// ── Tree helpers ─────────────────────────────────────────────────────────────

export function createNode(name: string): TreeNode {
	return { name, size: 0, totalSize: 0, isDir: false, children: new Map(), sortedCache: undefined }
}

export function insertEntry(root: TreeNode, entry: FileEntry, basePath: string): void {
	const relative = entry.path.startsWith(basePath) ? entry.path.slice(basePath.length).replace(/^\//, '') : entry.path

	const parts = relative.split('/').filter(Boolean)
	const ancestors: TreeNode[] = [root]
	let node = root

	for (const part of parts) {
		if (!node.children.has(part)) {
			node.children.set(part, createNode(part))
		}

		node = node.children.get(part)!
		ancestors.push(node)
	}

	node.size = entry.size
	node.isDir = entry.is_dir

	// Propagate size and invalidate sort caches only along the insertion path
	for (const ancestor of ancestors) {
		ancestor.totalSize += entry.size
		ancestor.sortedCache = undefined
	}
}

export function getSortedChildren(node: TreeNode): TreeNode[] {
	return (node.sortedCache ??= [...node.children.values()].sort((a, b) => b.totalSize - a.totalSize))
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
	if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)}T`
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}G`
	if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}M`
	if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)}K`
	return `${bytes}B`
}

export function formatPercent(size: number, total: number): string {
	if (total === 0) return '  0%'
	const pct = (size / total) * 100
	if (pct >= 100) return '100%'
	if (pct >= 1) return `${pct.toFixed(0)}%`.padStart(4)
	return ' <1%'
}

// ── Scanner binary resolution ────────────────────────────────────────────────

export function findScanBinary(): string {
	// When compiled with `bun build --compile`, import.meta.dir points into the
	// virtual /$bunfs/ filesystem. Use the real executable's directory instead.
	const binDir = import.meta.dir.startsWith('/$bunfs')
		? dirname(process.execPath)
		: resolvePath(join(dirname(resolvePath(import.meta.dir)), '.bin'))

	const localBin = join(binDir, 'dux-scan')
	if (existsSync(localBin)) return localBin
	throw new Error(`dux-scan binary not found at ${localBin} — run: bun run build`)
}

export function buildScanArgs(absPath: string, showHidden: boolean, maxDepth?: number): string[] {
	const args = [absPath]
	if (!showHidden) args.push('--skip-hidden')
	if (maxDepth !== undefined) args.push('--max-depth', String(maxDepth))
	return args
}

// ── Headless scan ────────────────────────────────────────────────────────────

export type ScanResult = {
	root: TreeNode
	entryCount: number
	skippedCount: number
	basePath: string
}

/**
 * Run dux-scan to completion and return the aggregated tree. Used by the
 * non-interactive (--json / --top) paths, which must not mount the Ink app.
 */
export function scanToTree(targetPath: string, showHidden: boolean, maxDepth?: number): Promise<ScanResult> {
	// Canonicalize to match scanner.rs canonicalize() — resolves symlinks
	const basePath = realpathSync(resolvePath(targetPath))
	const root = createNode('/')

	return new Promise((resolve, reject) => {
		const child = spawn(findScanBinary(), buildScanArgs(basePath, showHidden, maxDepth), {
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let buffer = ''
		let entryCount = 0
		let skippedCount = 0

		const killTimer = setTimeout(() => {
			child.kill()
			reject(new Error('dux-scan: timed out'))
		}, SCANNER_TIMEOUT_MS)

		child.stdout.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			buffer += chunk
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''

			for (const line of lines) {
				if (!line) continue

				try {
					insertEntry(root, FileEntrySchema.parse(JSON.parse(line)), basePath)
					entryCount += 1
				} catch {
					skippedCount += 1
				}
			}
		})

		// Permission errors are expected on a full-disk scan; surface them without
		// aborting, since a partial tree is still the answer the user asked for.
		child.stderr.setEncoding('utf8')
		child.stderr.on('data', (chunk: string) => process.stderr.write(chunk))

		child.on('error', (err) => {
			clearTimeout(killTimer)
			reject(err)
		})

		child.on('close', () => {
			clearTimeout(killTimer)
			resolve({ root, entryCount, skippedCount, basePath })
		})
	})
}
