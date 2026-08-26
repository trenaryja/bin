import { describe, expect, test } from 'bun:test'
import { normalize } from './normalize'

describe('code blocks', () => {
	test('names the language and the line count', () => {
		expect(normalize('```typescript\nconst a = 1\nconst b = 2\nconst c = 3\n```')).toBe(
			'a typescript snippet, 3 lines, on screen.',
		)
	})

	test('omits the language when the fence has none', () => {
		expect(normalize('```\nmake build\nmake test\n```')).toBe('a snippet, 2 lines, on screen.')
	})

	test('says line singular for one line', () => {
		expect(normalize('```sh\nbun test\n```')).toBe('a sh snippet, 1 line, on screen.')
	})

	test('speaks the sentence in place among paragraphs', () => {
		expect(normalize('Before.\n\n```go\nfmt.Println("hi")\n```\n\nAfter.')).toBe(
			'Before.\na go snippet, 1 line, on screen.\nAfter.',
		)
	})
})

describe('tables', () => {
	const table = ['| Tool | Status |', '| ---- | ------ |', '| bun | ready |', '| tsc | pending |'].join('\n')

	test('speaks one line per body row, pairing each header with its cell', () => {
		expect(normalize(table)).toBe('Tool: bun. Status: ready.\nTool: tsc. Status: pending.')
	})

	test('does not speak the header row on its own', () => {
		expect(normalize(table)).not.toContain('Tool: Status')
	})

	test('skips empty cells', () => {
		expect(normalize('| A | B |\n| - | - |\n| 1 |  |')).toBe('A: 1.')
	})
})

describe('inline code', () => {
	test('keeps the text verbatim', () => {
		expect(normalize('Run `bun --smol run build` first.')).toBe('Run bun --smol run build first.')
	})

	test('survives inside a table cell', () => {
		expect(normalize('| Flag | Meaning |\n| - | - |\n| `--smol` | less memory |')).toBe(
			'Flag: --smol. Meaning: less memory.',
		)
	})
})

describe('links', () => {
	test('keeps the link text', () => {
		expect(normalize('See [the docs](https://bun.sh/docs) for more.')).toBe('See the docs for more.')
	})

	test('speaks an autolink as a link', () => {
		expect(normalize('See <https://bun.sh/docs> for more.')).toBe('See a link for more.')
	})

	test('speaks a raw url as a link', () => {
		expect(normalize('Read https://bun.sh/docs today.')).toBe('Read a link today.')
	})

	test('speaks a url used as its own link text as a link', () => {
		expect(normalize('[https://bun.sh](https://bun.sh)')).toBe('a link')
	})
})

describe('block structure', () => {
	test('turns a heading into a sentence', () => {
		expect(normalize('## Getting started')).toBe('Getting started.')
	})

	test('leaves heading punctuation alone when it already ends a sentence', () => {
		expect(normalize('## Ready?')).toBe('Ready?')
	})

	test('turns list items into sentences, one per line', () => {
		expect(normalize('- install bun\n- run the tests\n- ship it')).toBe('install bun.\nrun the tests.\nship it.')
	})

	test('turns ordered list items into sentences', () => {
		expect(normalize('1. first step\n2. second step')).toBe('first step.\nsecond step.')
	})

	test('separates paragraphs with a newline', () => {
		expect(normalize('First paragraph.\n\nSecond paragraph.')).toBe('First paragraph.\nSecond paragraph.')
	})

	test('joins a soft-wrapped paragraph into one line', () => {
		expect(normalize('one line\nwrapped here')).toBe('one line wrapped here')
	})

	test('drops emphasis markers, thematic breaks and html tags', () => {
		expect(normalize('# Title\n\n---\n\n**Bold** and _italic_ and <span>markup</span>.')).toBe(
			'Title.\nBold and italic and markup.',
		)
	})
})

describe('images', () => {
	test('speaks an image', () => {
		expect(normalize('![a chart of latency](chart.png)')).toBe('an image')
	})

	test('speaks an image inline in a sentence', () => {
		expect(normalize('Here is ![alt text](chart.png) for you.')).toBe('Here is an image for you.')
	})
})

describe('whitespace', () => {
	test('collapses runs of whitespace and trims', () => {
		expect(normalize('  spaced    out\t\ttext  \n\n\n\n')).toBe('spaced out text')
	})
})

describe('secret redaction', () => {
	const cases: [string, string][] = [
		['github classic token', 'Use ghp_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github oauth token', 'Use gho_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github server token', 'Use ghs_16C7e42F292c6912E7710c838347Ae178B4a here'],
		['github fine-grained token', 'Use github_pat_11ABCDEFG0abcdefghijkl_ABCDEFGHIJK here'],
		['openai key', 'Use sk-proj-abc123DEF456ghi789JKL here'],
		['anthropic key', 'Use sk-ant-api03-AbCdEf123456 here'],
		['aws access key id', 'Use AKIAIOSFODNN7EXAMPLE here'],
		['bearer token', 'Use Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature here'],
	]

	for (const [label, markdown] of cases)
		test(`redacts a ${label}`, () => {
			expect(normalize(markdown)).toBe(`Use ${'a redacted secret'} here`)
		})

	test('redacts only the value of an env assignment', () => {
		expect(normalize('GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a')).toBe('GITHUB_TOKEN=a redacted secret')
	})

	test('redacts an assignment wrapped in bold without leaking the markers', () => {
		expect(normalize('Set **GITHUB_TOKEN=ghp_16C7e42F292c6912E7710c838347Ae178B4a** first.')).toBe(
			'Set GITHUB_TOKEN=a redacted secret first.',
		)
	})

	test('redacts only the value of a yaml-style key', () => {
		expect(normalize('api_key: hunter2sekrit')).toBe('api_key: a redacted secret')
	})

	test('redacts a password and a secret key by name', () => {
		expect(normalize('PASSWORD=correcthorse\n\nMY_SECRET: battery-staple')).toBe(
			'PASSWORD=a redacted secret\nMY_SECRET: a redacted secret',
		)
	})

	test('leaves unrelated assignments alone', () => {
		expect(normalize('LOG_LEVEL=debug')).toBe('LOG_LEVEL=debug')
	})

	test('survives bold markers around the token', () => {
		const spoken = normalize('The key is **ghp_16C7e42F292c6912E7710c838347Ae178B4a** okay')
		expect(spoken).toBe('The key is a redacted secret okay')
		expect(spoken).not.toContain('16C7e42F')
		expect(spoken).not.toContain('ghp')
	})

	test('survives underscore italics around the token', () => {
		const spoken = normalize('The key is _ghp_16C7e42F292c6912E7710c838347Ae178B4a_ okay')
		expect(spoken).toBe('The key is a redacted secret okay')
		expect(spoken).not.toContain('16C7e42F')
		expect(spoken).not.toContain('ghp')
	})

	test('redacts a secret inside a table cell', () => {
		const spoken = normalize('| Name | Value |\n| - | - |\n| prod | sk-proj-abc123DEF456ghi789 |')
		expect(spoken).toBe('Name: prod. Value: a redacted secret.')
		expect(spoken).not.toContain('abc123')
	})
})
