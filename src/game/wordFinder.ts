import { gjkDistance, type Vec2 } from "./gjk.ts";

export interface TrieNode {
	children: Map<string, TrieNode>;
	isWord: boolean;
}

export function buildTrie(words: string[]): TrieNode {
	const root: TrieNode = { children: new Map(), isWord: false };
	for (const word of words) {
		let node = root;
		for (const ch of word) {
			if (!node.children.has(ch)) {
				node.children.set(ch, { children: new Map(), isWord: false });
			}
			node = node.children.get(ch) as TrieNode;
		}
		node.isWord = true;
	}
	return root;
}

export interface LetterShape {
	text: string;
	vertices: Vec2[];
	// AABB for broad-phase
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function makeLetterShape(text: string, vertices: Vec2[]): LetterShape {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const v of vertices) {
		if (v.x < minX) minX = v.x;
		if (v.y < minY) minY = v.y;
		if (v.x > maxX) maxX = v.x;
		if (v.y > maxY) maxY = v.y;
	}
	return { text, vertices, minX, minY, maxX, maxY };
}

export function buildAdjacency(
	letters: LetterShape[],
	searchRadius: number,
): number[][] {
	const n = letters.length;
	const adj: number[][] = [];
	for (let i = 0; i < n; i++) adj.push([]);
	for (let i = 0; i < n; i++) {
		const a = letters[i];
		for (let j = i + 1; j < n; j++) {
			const b = letters[j];
			if (
				a.maxX + searchRadius < b.minX ||
				b.maxX + searchRadius < a.minX ||
				a.maxY + searchRadius < b.minY ||
				b.maxY + searchRadius < a.minY
			) continue;
			if (gjkDistance(a.vertices, b.vertices) <= searchRadius) {
				adj[i].push(j);
				adj[j].push(i);
			}
		}
	}
	return adj;
}

export function findLongestWord(
	letters: LetterShape[],
	trie: TrieNode,
	adj: number[][],
	minWordLength: number,
): { word: string; path: number[] } | null {
	const n = letters.length;
	let best: { word: string; path: number[] } | null = null;
	const visited = new Uint8Array(n);
	const path: number[] = [];

	const dfs = (idx: number, trieNode: TrieNode, word: string) => {
		let node = trieNode;
		let consumed = word;
		for (const ch of letters[idx].text) {
			const next = node.children.get(ch);
			if (!next) return;
			consumed += ch;
			node = next;
		}

		path.push(idx);

		// Skip length-1 paths that are just an already-formed word re-identifying
		// itself, so they don't poison the search and block shorter words from forming.
		const isTrivialReDetect = path.length === 1 && letters[idx].text === consumed;
		if (node.isWord && consumed.length >= minWordLength && !isTrivialReDetect) {
			if (!best || consumed.length > best.word.length) {
				best = { word: consumed, path: path.slice() };
			}
		}

		const neighbors = adj[idx];
		for (let k = 0; k < neighbors.length; k++) {
			const j = neighbors[k];
			if (visited[j]) continue;
			visited[j] = 1;
			dfs(j, node, consumed);
			visited[j] = 0;
		}

		path.pop();
	};

	for (let i = 0; i < n; i++) {
		visited[i] = 1;
		dfs(i, trie, "");
		visited[i] = 0;
	}

	return best;
}
