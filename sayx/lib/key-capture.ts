/**
 * key-capture — A modular, framework-agnostic key capture state machine.
 *
 * Designed for terminal UIs that need to let users rebind keyboard shortcuts.
 * Framework-agnostic: works with Ink, Bubbletea, or any system that can feed
 * key events into the state machine.
 *
 * Usage:
 *   const capture = createKeyCapture({ timeout: 3000 })
 *   capture.start('play')  // Begin listening for a key
 *   capture.feed('a', {})  // Feed a key event
 *   capture.result         // { key: 'a', displayLabel: 'a' }
 *   capture.accept()       // Finalize
 *
 * States:
 *   idle → capturing (start) → captured (valid key) → idle (accept/cancel)
 *                            → timeout (no input)   → idle (auto)
 */

type KeyModifiers = {
	ctrl?: boolean
	meta?: boolean
	shift?: boolean
}

export type KeyCaptureResult = {
	displayLabel: string
	key: string
	modifiers: KeyModifiers
}

export type KeyCaptureState = 'captured' | 'capturing' | 'idle' | 'timeout'

type KeyCaptureListener = (state: KeyCaptureState, result?: KeyCaptureResult) => void

type KeyCaptureOptions = {
	/** Keys that cannot be rebound (e.g., system keys) */
	reservedKeys?: string[]
	/** Milliseconds to wait before timing out capture mode */
	timeout?: number
}

export type KeyCapture = {
	/** Accept the captured key and return to idle */
	accept: () => KeyCaptureResult | undefined
	/** Which action is being rebound */
	actionName: string | undefined
	/** Cancel capture and return to idle */
	cancel: () => void
	/** Feed a key event into the state machine */
	feed: (input: string, modifiers: KeyModifiers) => 'accepted' | 'ignored' | 'reserved'
	/** Subscribe to state changes */
	onStateChange: (listener: KeyCaptureListener) => () => void
	/** The captured result (only valid in 'captured' state) */
	result: KeyCaptureResult | undefined
	/** Start capturing for a named action */
	start: (actionName: string) => void
	/** Current state */
	state: KeyCaptureState
}

const PLATFORM_RESERVED = new Set([
	'ctrl+\\', // SIGQUIT
	'ctrl+c', // SIGINT
	'ctrl+d', // EOF
	'ctrl+z', // SIGTSTP
])

function formatKeyLabel(input: string, modifiers: KeyModifiers): string {
	const parts: string[] = []
	if (modifiers.ctrl) parts.push('Ctrl')
	if (modifiers.meta) parts.push('Cmd')
	if (modifiers.shift) parts.push('Shift')

	const keyLabels: Record<string, string> = {
		' ': 'Space',
		'\r': 'Enter',
		'\t': 'Tab',
		'\x1b': 'Esc',
		'\x7f': 'Backspace',
	}

	parts.push(keyLabels[input] ?? input)
	return parts.join('+')
}

function normalizeKey(input: string, modifiers: KeyModifiers): string {
	const parts: string[] = []
	if (modifiers.ctrl) parts.push('ctrl')
	if (modifiers.meta) parts.push('meta')
	if (modifiers.shift) parts.push('shift')
	parts.push(input)
	return parts.join('+')
}

export function createKeyCapture(options: KeyCaptureOptions = {}): KeyCapture {
	const { timeout = 3000, reservedKeys = [] } = options
	const reserved = new Set([...PLATFORM_RESERVED, ...reservedKeys])
	const listeners = new Set<KeyCaptureListener>()

	let currentState: KeyCaptureState = 'idle'
	let currentResult: KeyCaptureResult | undefined
	let currentAction: string | undefined
	let timer: ReturnType<typeof setTimeout> | null = null

	function setState(state: KeyCaptureState, result?: KeyCaptureResult) {
		currentState = state
		currentResult = result
		for (const listener of listeners) listener(state, result)
	}

	function clearTimer() {
		if (!timer) return
		clearTimeout(timer)
		timer = null
	}

	const capture: KeyCapture = {
		get state() {
			return currentState
		},

		get result() {
			return currentResult
		},

		get actionName() {
			return currentAction
		},

		start(actionName: string) {
			clearTimer()
			currentAction = actionName
			setState('capturing')

			timer = setTimeout(() => {
				if (currentState === 'capturing') {
					setState('timeout')
					// Auto-return to idle after showing timeout briefly
					setTimeout(() => {
						if (currentState === 'timeout') {
							setState('idle')
							currentAction = undefined
						}
					}, 1500)
				}
			}, timeout)
		},

		feed(input: string, modifiers: KeyModifiers): 'accepted' | 'ignored' | 'reserved' {
			if (currentState !== 'capturing') return 'ignored'

			const normalized = normalizeKey(input, modifiers)
			if (reserved.has(normalized)) return 'reserved'

			clearTimer()

			const result: KeyCaptureResult = {
				key: normalized.includes('+') ? normalized : input,
				modifiers,
				displayLabel: formatKeyLabel(input, modifiers),
			}

			// Map special inputs to readable key names
			if (input === ' ') result.key = 'space'
			else if (input === '\r') result.key = 'enter'
			else if (input === '\t') result.key = 'tab'
			else if (input === '\x1b') result.key = 'escape'

			setState('captured', result)
			return 'accepted'
		},

		accept() {
			if (currentState !== 'captured') return undefined
			const result = currentResult
			clearTimer()
			setState('idle')
			currentAction = undefined
			return result
		},

		cancel() {
			clearTimer()
			setState('idle')
			currentAction = undefined
			currentResult = undefined
		},

		onStateChange(listener: KeyCaptureListener) {
			listeners.add(listener)

			return () => {
				listeners.delete(listener)
			}
		},
	}

	return capture
}
