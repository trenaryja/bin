import type { TextSource } from './types.ts'

const EMBEDDED_QUOTES = [
	'The only way to do great work is to love what you do. — Steve Jobs',
	'In the middle of difficulty lies opportunity. — Albert Einstein',
	'Not all those who wander are lost. — J.R.R. Tolkien',
	'The unexamined life is not worth living. — Socrates',
	'To be or not to be, that is the question. — Shakespeare',
	'I think, therefore I am. — René Descartes',
	'That which does not kill us makes us stronger. — Friedrich Nietzsche',
	'The only thing we have to fear is fear itself. — Franklin D. Roosevelt',
	'In three words I can sum up everything I learned about life: it goes on. — Robert Frost',
	'To infinity and beyond! — Buzz Lightyear',
	'May the Force be with you. — Star Wars',
	"You miss one hundred percent of the shots you don't take. — Wayne Gretzky",
	'Be yourself; everyone else is already taken. — Oscar Wilde',
	'Two things are infinite: the universe and human stupidity. — Albert Einstein',
	'A room without books is like a body without a soul. — Marcus Tullius Cicero',
	"You only live once, but if you do it right, once is enough. — Mae West",
	'The greatest glory in living lies not in never falling, but in rising every time we fall. — Nelson Mandela',
	'Life is what happens when you are busy making other plans. — John Lennon',
	'Get busy living or get busy dying. — Stephen King',
	"If you tell the truth, you don't have to remember anything. — Mark Twain",
	'Imagination is more important than knowledge. — Albert Einstein',
	'It does not do to dwell on dreams and forget to live. — J.K. Rowling',
	'The best time to plant a tree was 20 years ago. The second best time is now. — Chinese Proverb',
	'Do what you can, with what you have, where you are. — Theodore Roosevelt',
	'Everything you can imagine is real. — Pablo Picasso',
	'It is during our darkest moments that we must focus to see the light. — Aristotle',
	'The purpose of our lives is to be happy. — Dalai Lama',
	'Life is really simple, but we insist on making it complicated. — Confucius',
	'The mind is everything. What you think you become. — Buddha',
	'Strive not to be a success, but rather to be of value. — Albert Einstein',
]

export async function fetchWikipediaSummary(): Promise<string> {
	const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary')
	if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
	const data = (await res.json()) as { extract?: string }
	const extract = data.extract ?? 'No summary available.'
	const sentences = extract.match(/[^!.?]+[!.?]+/g)
	return sentences ? sentences.slice(0, 2).join(' ').trim() : extract.slice(0, 200)
}

export function getRandomQuote(): string {
	return EMBEDDED_QUOTES[Math.floor(Math.random() * EMBEDDED_QUOTES.length)]!
}

export function getDeterministicPhrase(phrases: string[], index: number): string {
	if (phrases.length === 0) return 'No deterministic phrases configured.'
	return phrases[index % phrases.length]!
}

