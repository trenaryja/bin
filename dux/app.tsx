import { spawn } from 'child_process'
import { realpathSync } from 'fs'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { resolve } from 'path'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { getFileColor, ui } from './colors.ts'
import {
	buildScanArgs,
	createNode,
	FileEntrySchema,
	findScanBinary,
	formatPercent,
	formatSize,
	getSortedChildren,
	insertEntry,
	SCANNER_TIMEOUT_MS,
} from './tree.ts'
import type { TreeNode } from './tree.ts'

// ── Types ────────────────────────────────────────────────────────────────────

type Props = {
	targetPath: string
	maxDepth?: number
	showHidden: boolean
}

const MAX_NAME_DISPLAY = 40
const MIN_COLUMNS = 50
const MAX_ERROR_LENGTH = 1000

// ── Formatting ───────────────────────────────────────────────────────────────

export function renderBar(size: number, total: number, width: number): string {
	const ratio = total > 0 ? size / total : 0
	const full = Math.round(ratio * width)

	return '█'.repeat(full) + '░'.repeat(width - full)
}

// ── Hook: useScanner ─────────────────────────────────────────────────────────

function useScanner(targetPath: string, showHidden: boolean, maxDepth?: number) {
	const [entryCount, setEntryCount] = useState(0)
	const [skippedCount, setSkippedCount] = useState(0)
	const [scanning, setScanning] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const rootNodeRef = useRef<TreeNode>(createNode('/'))
	// eslint-disable-next-line @eslint-react/use-state -- force-render pattern, value intentionally discarded
	const [, setRenderTick] = useState(0)
	// Canonicalize to match scanner.rs canonicalize() — resolves symlinks
	const basePath = realpathSync(resolve(targetPath))

	useEffect(() => {
		const absPath = basePath
		const bin = findScanBinary()

		const child = spawn(bin, buildScanArgs(absPath, showHidden, maxDepth), {
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let buffer = ''
		let batchCount = 0
		let batchSkipped = 0
		let flushTimer: ReturnType<typeof setTimeout> | null = null
		let errorFlushTimer: ReturnType<typeof setTimeout> | null = null
		let killTimer: ReturnType<typeof setTimeout> | null = null

		const flush = () => {
			flushTimer = null
			setEntryCount(batchCount)
			if (batchSkipped > 0) setSkippedCount(batchSkipped)
			setRenderTick((n) => n + 1)
		}

		child.stdout.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			buffer += chunk
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''

			for (const line of lines) {
				if (!line) continue

				try {
					const entry = FileEntrySchema.parse(JSON.parse(line))
					insertEntry(rootNodeRef.current, entry, absPath)
					batchCount += 1
				} catch {
					batchSkipped += 1
				}
			}

			// Debounce renders to every 50ms during scan
			flushTimer ??= setTimeout(flush, 50)
		})

		let errorBuffer = ''

		child.stderr.setEncoding('utf8')
		child.stderr.on('data', (chunk: string) => {
			// Cap local buffer to prevent unbounded growth between flushes
			if (errorBuffer.length < MAX_ERROR_LENGTH) {
				errorBuffer += chunk
			}

			// Debounce stderr renders to batch rapid permission errors
			errorFlushTimer ??= setTimeout(() => {
				errorFlushTimer = null
				const pending = errorBuffer
				errorBuffer = ''
				setError((prev) => {
					if (prev && prev.length >= MAX_ERROR_LENGTH) return prev
					const current = (prev ?? '') + pending
					return current.length > MAX_ERROR_LENGTH ? `${current.slice(0, MAX_ERROR_LENGTH)}…` : current
				})
				setRenderTick((n) => n + 1)
			}, 100)
		})

		child.on('close', () => {
			if (flushTimer) clearTimeout(flushTimer)
			if (errorFlushTimer) clearTimeout(errorFlushTimer)
			if (killTimer) clearTimeout(killTimer)
			// Final flush: counts and any remaining stderr
			setEntryCount(batchCount)
			if (batchSkipped > 0) setSkippedCount(batchSkipped)
			if (errorBuffer) {
				setError((prev) => {
					if (prev && prev.length >= MAX_ERROR_LENGTH) return prev
					const current = (prev ?? '') + errorBuffer
					return current.length > MAX_ERROR_LENGTH ? `${current.slice(0, MAX_ERROR_LENGTH)}…` : current
				})
			}

			setScanning(false)
			setRenderTick((n) => n + 1)
		})

		killTimer = setTimeout(() => {
			child.kill()
			setError((prev) => `${prev ? `${prev}\n` : ''}dux-scan: timed out`)
			setScanning(false)
			setRenderTick((n) => n + 1)
		}, SCANNER_TIMEOUT_MS)

		return () => {
			child.kill()
			clearTimeout(killTimer)
			if (flushTimer) clearTimeout(flushTimer)
			if (errorFlushTimer) clearTimeout(errorFlushTimer)
		}
	}, [basePath, showHidden, maxDepth])

	// eslint-disable-next-line react-hooks/refs -- intentional: mutable tree ref + force-render tick pattern for streaming data
	return { root: rootNodeRef.current, entryCount, skippedCount, scanning, error, basePath }
}

// ── Spinner ──────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function useSpinner(active: boolean): string {
	const [frame, setFrame] = useState(0)
	useEffect(() => {
		if (!active) return
		const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
		return () => clearInterval(id)
	}, [active])
	return active ? SPINNER_FRAMES[frame]! : '✓'
}

// ── Hook: useTerminalSize ────────────────────────────────────────────────────

function useTerminalSize(): { columns: number; rows: number } {
	const { stdout } = useStdout()
	const [size, setSize] = useState({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 })

	useEffect(() => {
		const onResize = () => setSize({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 })
		stdout.on('resize', onResize)

		return () => {
			stdout.off('resize', onResize)
		}
	}, [stdout])

	return size
}

// ── Hook: useNavigation ──────────────────────────────────────────────────────

type Navigation = {
	current: TreeNode
	pathValid: boolean
	path: string[]
	cursor: number
	scrollOffset: number
	children: TreeNode[]
	clampedCursor: number
}

function useNavigation(root: TreeNode): Navigation {
	const [path, setPath] = useState<string[]>([])
	const [cursor, setCursor] = useState(0)
	const [scrollOffset, setScrollOffset] = useState(0)
	const { exit } = useApp()

	let current = root
	let pathValid = true

	for (const segment of path) {
		const child = current.children.get(segment)

		if (!child) {
			pathValid = false
			break
		}

		current = child
	}

	const children = getSortedChildren(current)
	const clampedCursor = Math.min(cursor, Math.max(0, children.length - 1))

	useInput((input, key) => {
		if (input === 'q') exit()
		if (key.upArrow) {
			setCursor((c) => {
				const next = Math.max(0, c - 1)
				setScrollOffset((s) => (next < s ? next : s))
				return next
			})
		}
		if (key.downArrow) {
			setCursor((c) => {
				const next = Math.min(Math.max(0, children.length - 1), c + 1)
				setScrollOffset((s) => {
					const maxVis = Math.max(1, (process.stdout.rows ?? 24) - 10)
					return next >= s + maxVis ? next - maxVis + 1 : s
				})
				return next
			})
		}
		if (key.return || key.rightArrow) {
			const selected = children[clampedCursor]

			if (selected && selected.children.size > 0) {
				setPath((p) => [...p, selected.name])
				setCursor(0)
				setScrollOffset(0)
			}
		}
		if (key.leftArrow || key.backspace || key.delete) {
			setPath((p) => p.slice(0, -1))
			setCursor(0)
			setScrollOffset(0)
		}
	})

	return { current, pathValid, path, cursor, scrollOffset, children, clampedCursor }
}

// ── Component: FileList ─────────────────────────────────────────────────────

type FileListProps = {
	visible: TreeNode[]
	viewStart: number
	clampedCursor: number
	totalSize: number
	barWidth: number
}

function FileList({ visible, viewStart, clampedCursor, totalSize, barWidth }: FileListProps): ReactNode {
	return visible.map((child, i) => {
		const childSize = child.totalSize
		const isCursor = viewStart + i === clampedCursor
		const isDir = child.children.size > 0
		const color = getFileColor(child.name, isDir)
		const icon = isDir ? '/' : ' '
		const displayName =
			child.name.length >= MAX_NAME_DISPLAY ? `${child.name.slice(0, MAX_NAME_DISPLAY - 1)}…` : child.name

		return (
			<Box key={child.name} gap={1}>
				<Text color={isCursor ? ui.accent : undefined} bold={isCursor}>
					{isCursor ? '▸' : ' '}
				</Text>
				<Text color={ui.success}>{renderBar(childSize, totalSize, barWidth)}</Text>
				<Text>{formatPercent(childSize, totalSize)}</Text>
				<Text dimColor>{formatSize(childSize).padStart(7)}</Text>
				<Text color={isCursor ? ui.accent : color} bold={isCursor}>
					{displayName}
					{icon}
				</Text>
			</Box>
		)
	})
}

// ── Viewport ────────────────────────────────────────────────────────────────

type ViewportInput = {
	children: TreeNode[]
	clampedCursor: number
	scrollOffset: number
	rows: number
	columns: number
	atMaxDepth: boolean
	hasError: boolean
}

function computeViewport({
	children,
	clampedCursor,
	scrollOffset,
	rows,
	columns,
	atMaxDepth,
	hasError,
}: ViewportInput) {
	// Chrome: padding(1) + header(1) + margin(1) + path(1) + margin(1) + footer(1) + padding(1) = 7
	const baseChromeRows = 7 + (hasError ? 2 : 0) + (atMaxDepth ? 1 : 0)
	const estimatedVisible = Math.max(1, rows - baseChromeRows)
	const needsScroll = children.length > estimatedVisible
	const chromeRows = baseChromeRows + (needsScroll ? 2 : 0)
	const maxVisible = Math.max(1, rows - chromeRows)

	let viewStart = scrollOffset
	if (clampedCursor < viewStart) viewStart = clampedCursor
	if (clampedCursor >= viewStart + maxVisible) viewStart = clampedCursor - maxVisible + 1
	viewStart = Math.max(0, Math.min(viewStart, Math.max(0, children.length - maxVisible)))

	const visible = atMaxDepth ? [] : children.slice(viewStart, viewStart + maxVisible)
	const maxNameLen = Math.min(MAX_NAME_DISPLAY, Math.max(1, ...visible.map((c) => c.name.length + 1)))
	const barWidth = Math.max(10, columns - (2 + 1 + 1 + 1 + 4 + 1 + 7 + 1 + maxNameLen))

	return {
		visible,
		viewStart,
		maxVisible,
		hasMore: viewStart + maxVisible < children.length,
		hasAbove: viewStart > 0,
		barWidth,
	}
}

// ── Component: StatusHint ────────────────────────────────────────────────────

function StatusHint({
	atMaxDepth,
	pathValid,
	scanning,
	isEmpty,
}: {
	atMaxDepth: boolean
	pathValid: boolean
	scanning: boolean
	isEmpty: boolean
}): ReactNode {
	if (atMaxDepth) return <Text dimColor> (max depth reached)</Text>
	if (!pathValid && scanning) return <Text dimColor> (loading...)</Text>
	if (isEmpty && pathValid && !scanning) return <Text dimColor> (empty)</Text>
	return null
}

// ── App ──────────────────────────────────────────────────────────────────────

export function App({ targetPath, maxDepth, showHidden }: Props): ReactNode {
	const { root, entryCount, skippedCount, scanning, error } = useScanner(targetPath, showHidden, maxDepth)
	const { current, pathValid, path, scrollOffset, children, clampedCursor } = useNavigation(root)
	const { columns, rows } = useTerminalSize()
	const spinner = useSpinner(scanning)

	const atMaxDepth = maxDepth !== undefined && path.length >= maxDepth
	const { visible, viewStart, maxVisible, hasMore, hasAbove, barWidth } = computeViewport({
		children,
		clampedCursor,
		scrollOffset,
		rows,
		columns,
		atMaxDepth,
		hasError: !!error,
	})
	const { totalSize } = current
	const displayPath = `/${path.join('/')}`

	if (columns < MIN_COLUMNS) {
		return (
			<Box padding={1}>
				<Text color={ui.warning}>
					Terminal too narrow ({columns} cols, need {MIN_COLUMNS}+)
				</Text>
			</Box>
		)
	}

	return (
		<Box flexDirection='column' padding={1}>
			{/* Header */}
			<Box marginBottom={1} gap={1}>
				<Text bold color={ui.accent}>
					dux
				</Text>
				<Text dimColor>
					{scanning
						? `${spinner} scanning... ${entryCount.toLocaleString()} entries`
						: `${entryCount.toLocaleString()} entries`}
					{skippedCount > 0 && ` (${skippedCount.toLocaleString()} skipped)`}
				</Text>
			</Box>

			{/* Current path */}
			<Box marginBottom={1}>
				<Text bold color={ui.info}>
					{displayPath}
				</Text>
				<Text> </Text>
				<Text bold>{formatSize(totalSize)}</Text>
			</Box>

			{/* Error */}
			{error && (
				<Box marginBottom={1}>
					<Text color={ui.error}>{error.trim()}</Text>
				</Box>
			)}

			{hasAbove && <Text dimColor> ↑ {viewStart} more above</Text>}
			<FileList
				visible={visible}
				viewStart={viewStart}
				clampedCursor={clampedCursor}
				totalSize={totalSize}
				barWidth={barWidth}
			/>
			{hasMore && <Text dimColor> ↓ {children.length - viewStart - maxVisible} more below</Text>}

			<StatusHint atMaxDepth={atMaxDepth} pathValid={pathValid} scanning={scanning} isEmpty={visible.length === 0} />

			{/* Footer */}
			<Box marginTop={1}>
				<Text dimColor>↑↓ navigate →/Enter open ←/Bksp back q quit</Text>
			</Box>
		</Box>
	)
}
