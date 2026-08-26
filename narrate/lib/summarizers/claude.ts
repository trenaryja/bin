import { createCliSummarizer } from './shared'

// `--tools` is variadic, so its empty value must stay last or it swallows the flags after it.
export const claudeSummarizer = createCliSummarizer('claude', [
	'claude',
	'-p',
	'--output-format',
	'text',
	'--model',
	'haiku',
	'--tools',
	'',
])
