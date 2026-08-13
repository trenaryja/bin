import { chat, isOllamaModel } from '@/lib'
import config from './config.json'

export const generate = (diff: string): Promise<string> => {
	if (!isOllamaModel(config.model)) throw new Error(`git-ai-commit: unknown model "${config.model}" in config.json`)

	return chat(
		config.model,
		[
			{ role: 'system', content: config.systemPrompt },
			{ role: 'user', content: `Here is the staged diff:\n\n${diff}` },
		],
		{ numCtx: config.numCtx },
	)
}
