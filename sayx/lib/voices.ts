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

export function getVoiceMeta(voiceName: string, config: SayxConfig, voice?: Voice): VoiceMeta {
	const baseName = voiceName.replace(/\s*\(.*\)$/, '')
	const configMeta = config.voices[voiceName] ?? config.voices[baseName] ?? { bio: '', tags: [] }

	if (!voice) return configMeta

	// Auto-derive lang/ and locale/ tags from system voice data
	const autoTags = [`lang/${voice.language}`, `locale/${voice.locale.toLowerCase()}`]
	const mergedTags = [...new Set([...configMeta.tags, ...autoTags])]

	return { bio: configMeta.bio, tags: mergedTags }
}

export function getAllTags(config: SayxConfig, voices: Voice[]): string[] {
	const tagSet = new Set<string>()

	for (const meta of Object.values(config.voices)) {
		for (const tag of meta.tags) tagSet.add(tag)
	}

	// Auto-derive lang/ and locale/ tags from all system voices
	for (const voice of voices) {
		tagSet.add(`lang/${voice.language}`)
		tagSet.add(`locale/${voice.locale.toLowerCase()}`)
	}

	return [...tagSet].sort()
}

export function filterVoices(
	voices: Voice[],
	options: {
		searchQuery?: string
		tags?: string[]
		config?: SayxConfig
	},
): Voice[] {
	let filtered = voices

	if (options.searchQuery) {
		const terms = options.searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
		if (terms.length > 0)
			filtered = filtered.filter((v) => {
				const meta = options.config ? getVoiceMeta(v.name, options.config, v) : undefined
				const searchable = [v.name, v.locale, meta?.bio ?? '', ...(meta?.tags ?? [])].join(' ').toLowerCase()
				return terms.every((term) => searchable.includes(term))
			})
	}

	if (options.tags?.length && options.config)
		filtered = filtered.filter((v) => {
			const meta = getVoiceMeta(v.name, options.config!, v)
			return options.tags!.some((t) => meta.tags.includes(t))
		})

	return filtered
}
