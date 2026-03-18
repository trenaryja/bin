import type { LiteralUnion } from 'type-fest'

export type OllamaModel = LiteralUnion<
	| 'codellama'
	| 'deepseek-coder-v2'
	| 'llama3.2:1b'
	| 'llama3.2'
	| 'mistral'
	| 'qwen2.5-coder:14b'
	| 'qwen2.5-coder:32b'
	| 'qwen2.5-coder:7b',
	string
>

export type Message = {
	role: 'assistant' | 'system' | 'user'
	content: string
}

export const OLLAMA_URL = 'http://localhost:11434/v1/chat/completions'

export const chat = async (model: OllamaModel, messages: Message[], url = OLLAMA_URL): Promise<string> => {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model, messages, stream: false }),
	})

	if (!response.ok) throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)

	const data = (await response.json()) as {
		choices: { message: { content: string } }[]
	}

	const content = data.choices?.[0]?.message?.content?.trim()
	if (!content) throw new Error('Empty response from Ollama')
	return content
}
