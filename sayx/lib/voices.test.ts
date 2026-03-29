import { describe, expect, test } from 'bun:test'

import type { SayxConfig, Voice } from './types.ts'
import { filterVoices, getAllTags, getVoiceMeta, parseVoices } from './voices.ts'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const sayOutput = `Albert              en_US    # Hello! My name is Albert.
Alice               it_IT    # Ciao! Mi chiamo Alice.
Bad News            en_US    # Hello! My name is Bad News.
Daniel              en_GB    # Hello! My name is Daniel.
Eddy (English (US)) en_US    # Hello! My name is Eddy.
Eddy (French (France)) fr_FR    # Bonjour, je m'appelle Eddy.`

const voices: Voice[] = [
	{ name: 'Albert', locale: 'en_US', language: 'en', sample: 'Hello!' },
	{ name: 'Alice', locale: 'it_IT', language: 'it', sample: 'Ciao!' },
	{ name: 'Bad News', locale: 'en_US', language: 'en', sample: 'Hello!' },
	{ name: 'Daniel', locale: 'en_GB', language: 'en', sample: 'Hello!' },
	{ name: 'Eddy (English (US))', locale: 'en_US', language: 'en', sample: 'Hello!' },
]

const config = {
	voices: {
		Albert: { bio: 'Classic robotic voice', tags: ['classic', 'robotic', '1990s'] },
		Alice: { bio: 'Italian female', tags: ['natural', 'female', 'italian'] },
		'Bad News': { bio: 'Dramatic downer', tags: ['novelty', 'dramatic'] },
		Daniel: { bio: 'British English male', tags: ['natural', 'male', 'british'] },
		Eddy: { bio: 'Friendly nerdy male', tags: ['natural', 'male', 'multilingual'] },
	},
} as unknown as SayxConfig

// ── parseVoices ────────────────────────────────────────────────────────────────

describe('parseVoices', () => {
	test('parses standard say output', () => {
		const result = parseVoices(sayOutput)
		expect(result).toHaveLength(6)
	})

	test('extracts name, locale, language', () => {
		const result = parseVoices(sayOutput)
		expect(result[0]).toEqual({
			name: 'Albert',
			locale: 'en_US',
			language: 'en',
			sample: 'Hello! My name is Albert.',
		})
	})

	test('handles names with spaces', () => {
		const result = parseVoices(sayOutput)
		const badNews = result.find((v) => v.name === 'Bad News')
		expect(badNews).toBeDefined()
		expect(badNews!.locale).toBe('en_US')
	})

	test('handles names with parentheses', () => {
		const result = parseVoices(sayOutput)
		const eddy = result.find((v) => v.name === 'Eddy (English (US))')
		expect(eddy).toBeDefined()
		expect(eddy!.locale).toBe('en_US')
	})

	test('skips empty lines', () => {
		const result = parseVoices('\n\nAlbert              en_US    # Hello!\n\n')
		expect(result).toHaveLength(1)
	})
})

// ── getVoiceMeta ───────────────────────────────────────────────────────────────

describe('getVoiceMeta', () => {
	test('returns metadata for exact name match', () => {
		const meta = getVoiceMeta('Albert', config)
		expect(meta.bio).toBe('Classic robotic voice')
		expect(meta.tags).toContain('classic')
	})

	test('falls back to base name for locale-qualified voices', () => {
		const meta = getVoiceMeta('Eddy (English (US))', config)
		expect(meta.bio).toBe('Friendly nerdy male')
	})

	test('returns empty metadata for unknown voices', () => {
		const meta = getVoiceMeta('UnknownVoice', config)
		expect(meta.bio).toBe('')
		expect(meta.tags).toEqual([])
	})
})

// ── getAllTags ──────────────────────────────────────────────────────────────────

describe('getAllTags', () => {
	test('returns sorted unique tags', () => {
		const tags = getAllTags(config)
		expect(tags).toEqual([...tags].sort())
		expect(new Set(tags).size).toBe(tags.length)
	})

	test('includes tags from all voices', () => {
		const tags = getAllTags(config)
		expect(tags).toContain('classic')
		expect(tags).toContain('natural')
		expect(tags).toContain('italian')
		expect(tags).toContain('1990s')
	})
})

// ── filterVoices ───────────────────────────────────────────────────────────────

describe('filterVoices', () => {
	test('filters by language', () => {
		const result = filterVoices(voices, { language: 'en' })
		expect(result.every((v) => v.language === 'en')).toBe(true)
		expect(result).toHaveLength(4)
	})

	test('filters by single search term', () => {
		const result = filterVoices(voices, { searchQuery: 'albert', config })
		expect(result).toHaveLength(1)
		expect(result[0]!.name).toBe('Albert')
	})

	test('filters by space-separated terms (AND logic)', () => {
		const result = filterVoices(voices, { searchQuery: 'natural british', config })
		expect(result).toHaveLength(1)
		expect(result[0]!.name).toBe('Daniel')
	})

	test('search matches bio text', () => {
		const result = filterVoices(voices, { searchQuery: 'dramatic', config })
		expect(result).toHaveLength(1)
		expect(result[0]!.name).toBe('Bad News')
	})

	test('search matches tags', () => {
		const result = filterVoices(voices, { searchQuery: '1990s', config })
		expect(result).toHaveLength(1)
		expect(result[0]!.name).toBe('Albert')
	})

	test('filters by tags', () => {
		const result = filterVoices(voices, { tags: ['natural'], config })
		expect(result).toHaveLength(3) // Alice, Daniel, Eddy
		expect(result.every((v) => getVoiceMeta(v.name, config).tags.includes('natural'))).toBe(true)
	})

	test('tag filter uses OR logic (any tag matches)', () => {
		const result = filterVoices(voices, { tags: ['classic', 'italian'], config })
		expect(result).toHaveLength(2) // Albert (classic) and Alice (italian)
	})

	test('combines language + search', () => {
		const result = filterVoices(voices, { language: 'en', searchQuery: 'classic', config })
		expect(result).toHaveLength(1)
		expect(result[0]!.name).toBe('Albert')
	})

	test('returns all voices with no filters', () => {
		const result = filterVoices(voices, {})
		expect(result).toHaveLength(voices.length)
	})

	test('returns empty array when nothing matches', () => {
		const result = filterVoices(voices, { searchQuery: 'zzzznonexistent', config })
		expect(result).toHaveLength(0)
	})
})
