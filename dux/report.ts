import { formatPercent, formatSize, getSortedChildren } from './tree.ts'
import type { TreeNode } from './tree.ts'

export type JsonNode = {
	name: string
	size: number
	isDir: boolean
	children?: JsonNode[]
}

/**
 * Serialize the aggregated tree, pruning below `depth`. Depth 0 emits the node
 * alone — without pruning, a home-directory scan would produce hundreds of MB
 * of JSON.
 */
export function toJson(node: TreeNode, depth: number): JsonNode {
	const isDir = node.children.size > 0 || node.isDir
	const base = { name: node.name, size: node.totalSize, isDir }
	if (depth <= 0 || node.children.size === 0) return base

	return { ...base, children: getSortedChildren(node).map((child) => toJson(child, depth - 1)) }
}

export function topEntries(root: TreeNode, limit: number): TreeNode[] {
	return getSortedChildren(root).slice(0, limit)
}

/** Aligned `size  pct  name` rows — the flag-driven equivalent of the TUI list. */
export function formatTopTable(entries: TreeNode[], total: number): string {
	return entries
		.map((entry) => {
			const suffix = entry.children.size > 0 || entry.isDir ? '/' : ''
			return `${formatSize(entry.totalSize).padStart(8)}  ${formatPercent(entry.totalSize, total)}  ${entry.name}${suffix}`
		})
		.join('\n')
}
