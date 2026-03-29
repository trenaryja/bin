import { spawn } from 'bun'

import type { SayxConfig, Voice, VoiceMeta } from './types.ts'

export function parseVoices(output: string): Voice[] {
	const voices: Voice[] = []

	for (const line of output.split('\n')) {
		if (!line.trim()) continue
		const hashIdx = line.indexOf('#')
		const sample = hashIdx !== -1 ? line.slice(hashIdx + 2).trim() : ''
		const meta = hashIdx !== -1 ? line.slice(0, hashIdx).trim() : line.trim()

		const parts = meta.split(/\s+/)
		const locale = parts.pop() ?? ''
		const name = parts.join(' ')
		const language = locale.split('_')[0] ?? ''

		voices.push({ name, locale, language, sample })
	}

	return voices
}

export async function loadSystemVoices(): Promise<Voice[]> {
	const proc = spawn(['say', '--voice=?'], { stdout: 'pipe', stderr: 'pipe' })
	const text = await new Response(proc.stdout).text()
	await proc.exited
	return parseVoices(text)
}

export function getVoiceMeta(voiceName: string, config: SayxConfig): VoiceMeta {
	// Match by base name (strip locale qualifier like "Eddy (English (US))" -> "Eddy")
	const baseName = voiceName.replace(/\s*\(.*\)$/, '')
	return config.voices[voiceName] ?? config.voices[baseName] ?? { bio: '', tags: [] }
}

export function getAllTags(config: SayxConfig): string[] {
	const tagSet = new Set<string>()

	for (const meta of Object.values(config.voices)) {
		for (const tag of meta.tags) {
			tagSet.add(tag)
		}
	}

	return [...tagSet].sort()
}

export function filterVoices(
	voices: Voice[],
	options: {
		language?: string
		searchQuery?: string
		tags?: string[]
		config?: SayxConfig
	},
): Voice[] {
	let filtered = voices

	if (options.language) {
		filtered = filtered.filter((v) => v.language === options.language)
	}

	if (options.searchQuery) {
		// Space-separated terms use AND logic: "male british" matches both
		const terms = options.searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
		if (terms.length > 0) {
			filtered = filtered.filter((v) => {
				const meta = options.config ? getVoiceMeta(v.name, options.config) : undefined
				const searchable = [
					v.name.toLowerCase(),
					v.locale.toLowerCase(),
					meta?.bio.toLowerCase() ?? '',
					...(meta?.tags.map((t) => t.toLowerCase()) ?? []),
				].join(' ')

				return terms.every((term) => searchable.includes(term))
			})
		}
	}

	if (options.tags?.length && options.config) {
		filtered = filtered.filter((v) => {
			const meta = getVoiceMeta(v.name, options.config!)
			return options.tags!.some((t) => meta.tags.includes(t))
		})
	}

	return filtered
}
