import { Ollama } from 'ollama'

export type { Message, Options } from 'ollama'

export const OLLAMA_MODELS = ['deepseek-coder-v2:latest', 'mistral:7b', 'qwen2.5-coder:7b'] as const

export type OllamaModel = (typeof OLLAMA_MODELS)[number]

/** JSON config imports widen to `string`; narrow at the boundary so a typo fails loudly. */
export const isOllamaModel = (value: string): value is OllamaModel => OLLAMA_MODELS.some((model) => model === value)

const ollama = new Ollama()

export const chat = async (
	model: OllamaModel,
	messages: { role: string; content: string }[],
	options?: { numCtx?: number },
): Promise<string> => {
	const response = await ollama.chat({
		model,
		messages,
		options: options?.numCtx ? { num_ctx: options.numCtx } : undefined,
	})

	const content = response.message?.content?.trim()
	if (!content) throw new Error('Empty response from Ollama')
	return content
}
