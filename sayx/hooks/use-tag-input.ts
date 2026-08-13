// Tag chip/text-entry state machine. Split out of TagBox so the component stays a render layer.
import { useInput } from 'ink'
import type { Key } from 'ink'
import { useState } from 'react'

type TagInputOptions = {
	activeTags: string[]
	allTags: string[]
	focused: boolean
	onRequestFocusDown: () => void
	onRequestFocusUp: () => void
	onTagsChange: (tags: string[]) => void
}

const MAX_SUGGESTIONS = 5

const isBackspace = (input: string, key: Key) => key.backspace || key.delete || input === '\x7f' || input === '\b'

const isPrintable = (input: string, key: Key) =>
	input.length === 1 && input.charCodeAt(0) >= 32 && input.charCodeAt(0) <= 126 && !key.ctrl && !key.meta

export function useTagInput(options: TagInputOptions) {
	const { activeTags, allTags, focused, onRequestFocusDown, onRequestFocusUp, onTagsChange } = options

	const [inputValue, setInputValue] = useState('')
	const [chipFocused, setChipFocused] = useState(false)
	const [chipCursor, setChipCursor] = useState(0)

	const typeaheadMatch = inputValue
		? allTags.find((tag) => !activeTags.includes(tag) && tag.toLowerCase().startsWith(inputValue.toLowerCase()))
		: undefined

	const otherMatches = inputValue
		? allTags
				.filter(
					(tag) =>
						!activeTags.includes(tag) && tag.toLowerCase().includes(inputValue.toLowerCase()) && tag !== typeaheadMatch,
				)
				.slice(0, MAX_SUGGESTIONS)
		: []

	function addTag(tag: string) {
		if (!activeTags.includes(tag)) onTagsChange([...activeTags, tag])
		setInputValue('')
	}

	function removeTagAt(index: number) {
		const next = activeTags.filter((_, i) => i !== index)
		onTagsChange(next)
		setChipFocused(next.length > 0)
		setChipCursor(next.length === 0 ? 0 : Math.min(index, next.length - 1))
	}

	// Cursor walks the chip row; anything printable drops back to the text field.
	function handleChipKeys(input: string, key: Key) {
		if (key.leftArrow) {
			setChipCursor((cursor) => Math.max(0, cursor - 1))
			return
		}
		if (key.rightArrow) {
			if (chipCursor >= activeTags.length - 1) setChipFocused(false)
			else setChipCursor((cursor) => cursor + 1)
			return
		}
		if (key.return || isBackspace(input, key)) {
			removeTagAt(chipCursor)
			return
		}
		if (key.upArrow) {
			onRequestFocusUp()
			return
		}
		if (key.downArrow) {
			onRequestFocusDown()
			return
		}
		if (isPrintable(input, key)) {
			setChipFocused(false)
			setInputValue(input)
		}
	}

	// Left arrow on an empty field steps back into the chips; backspace eats the last one.
	function handleTextKeys(input: string, key: Key) {
		if (key.upArrow) {
			onRequestFocusUp()
			return
		}
		if (key.downArrow) {
			onRequestFocusDown()
			return
		}
		if (key.leftArrow && inputValue === '' && activeTags.length > 0) {
			setChipFocused(true)
			setChipCursor(activeTags.length - 1)
			return
		}
		if (key.tab || key.return) {
			if (typeaheadMatch) addTag(typeaheadMatch)
			return
		}
		if (isBackspace(input, key)) {
			if (inputValue.length > 0) setInputValue((value) => value.slice(0, -1))
			else if (activeTags.length > 0) removeTagAt(activeTags.length - 1)
			return
		}
		if (isPrintable(input, key)) setInputValue((value) => value + input)
	}

	useInput((input, key) => {
		if (!focused) return
		if (chipFocused && activeTags.length > 0) handleChipKeys(input, key)
		else handleTextKeys(input, key)
	})

	return {
		chipCursor,
		chipFocused,
		// True while the text field owns the caret — the render branches on this repeatedly.
		editing: focused && !chipFocused,
		inputValue,
		otherMatches,
		typeaheadMatch,
	}
}
