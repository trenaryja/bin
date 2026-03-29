import { Ollama } from 'ollama'

export type { Message, Options } from 'ollama'

export type OllamaModel = 'deepseek-coder-v2:latest' | 'mistral:7b' | 'qwen2.5-coder:7b'

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
