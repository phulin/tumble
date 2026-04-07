import { describe, expect, it } from "vitest";
import type { Vec2 } from "./gjk";
import {
	buildAdjacency,
	buildTrie,
	findLongestWord,
	type LetterShape,
	makeLetterShape,
} from "./wordFinder";

function rotRect(
	cx: number,
	cy: number,
	w: number,
	h: number,
	angle: number,
): Vec2[] {
	const hw = w / 2,
		hh = h / 2;
	const cos = Math.cos(angle),
		sin = Math.sin(angle);
	return [
		{ x: -hw, y: -hh },
		{ x: hw, y: -hh },
		{ x: hw, y: hh },
		{ x: -hw, y: hh },
	].map(({ x, y }) => ({
		x: cx + x * cos - y * sin,
		y: cy + x * sin + y * cos,
	}));
}

function letter(
	text: string,
	cx: number,
	cy: number,
	w = 40,
	h = 50,
	angle = 0,
): LetterShape {
	return makeLetterShape(text, rotRect(cx, cy, w, h, angle));
}

const SEARCH_RADIUS = 60;

const trie = buildTrie([
	"CAT",
	"CATS",
	"DOG",
	"DOVE",
	"DO",
	"DOVES",
	"OVE",
	"ED",
	"DE",
]);

describe("findLongestWord: basic word finding", () => {
	it("finds CAT from three adjacent letters", () => {
		const letters = [letter("C", 0, 0), letter("A", 45, 0), letter("T", 90, 0)];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("CAT");
	});

	it("picks CATS over CAT", () => {
		const letters = [
			letter("C", 0, 0),
			letter("A", 45, 0),
			letter("T", 90, 0),
			letter("S", 135, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("CATS");
	});

	it("returns null if no word possible", () => {
		const letters = [letter("X", 0, 0), letter("Q", 45, 0), letter("Z", 90, 0)];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)).toBeNull();
	});

	it("enforces minWordLength", () => {
		const letters = [letter("D", 0, 0), letter("O", 45, 0)];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		// "DO" is in the trie but length 2 < minWordLength 3
		expect(findLongestWord(letters, trie, adj, 3)).toBeNull();
	});
});

describe("findLongestWord: DOVE regression (from screenshot)", () => {
	it("finds DOVE from 4 adjacent letters in a row", () => {
		const letters = [
			letter("D", 0, 0),
			letter("O", 45, 0),
			letter("V", 90, 0),
			letter("E", 135, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("DOVE");
	});

	it("finds DOVE with slight rotations", () => {
		const letters = [
			letter("D", 0, 0, 40, 50, 0.2),
			letter("O", 45, 5, 40, 50, -0.1),
			letter("V", 90, -3, 40, 50, 0.3),
			letter("E", 135, 2, 40, 50, -0.2),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("DOVE");
	});

	it("finds DOVE when letters are in random order in the array", () => {
		const letters = [
			letter("V", 90, 0),
			letter("E", 135, 0),
			letter("D", 0, 0),
			letter("O", 45, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("DOVE");
	});

	it("finds DOVE when surrounded by non-word letters", () => {
		const letters = [
			letter("X", -45, 0),
			letter("D", 0, 0),
			letter("O", 45, 0),
			letter("V", 90, 0),
			letter("E", 135, 0),
			letter("Q", 180, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("DOVE");
	});

	it("finds DOVE in a 2D cluster (not just a line)", () => {
		// D top, O below, V right of O, E below V
		const letters = [
			letter("D", 0, 0),
			letter("O", 0, 55),
			letter("V", 45, 55),
			letter("E", 45, 110),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)?.word).toBe("DOVE");
	});

	it("does NOT find DOVE when a gap breaks the chain", () => {
		const letters = [
			letter("D", 0, 0),
			letter("O", 45, 0),
			letter("V", 90, 0),
			letter("E", 250, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie, adj, 3)).toBeNull();
	});
});

describe("findLongestWord: combined-word-bystander regression", () => {
	// Before the fix, an unrelated long combined word would "poison" the search:
	// findLongestWord would trivially return it as best (length-1 path), and
	// combineLongestWord's skip-check would then bail out, blocking DOVE from forming.
	it("finds DOVE when an unrelated longer combined word sits far away", () => {
		const trie2 = buildTrie(["DOVE", "IDIOCIES", "ANALYSES"]);
		const letters = [
			letter("IDIOCIES", -300, 0, 200, 50),
			letter("D", 0, 0),
			letter("O", 45, 0),
			letter("V", 90, 0),
			letter("E", 135, 0),
			letter("ANALYSES", 400, 0, 200, 50),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie2, adj, 3)?.word).toBe("DOVE");
	});

	it("ignores a trivial re-detect even when no other word exists", () => {
		const trie2 = buildTrie(["IDIOCIES"]);
		const letters = [letter("IDIOCIES", 0, 0, 200, 50)];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie2, adj, 3)).toBeNull();
	});

	it("can still extend an existing combined word to a longer real word", () => {
		// If "DO" is already combined and "V", "E" are adjacent, we should find DOVE.
		const trie2 = buildTrie(["DOVE", "DO"]);
		const letters = [
			letter("DO", 0, 0, 80, 50),
			letter("V", 60, 0),
			letter("E", 105, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(findLongestWord(letters, trie2, adj, 3)?.word).toBe("DOVE");
	});
});

describe("buildAdjacency", () => {
	it("is symmetric", () => {
		const letters = [
			letter("A", 0, 0),
			letter("B", 45, 0),
			letter("C", 90, 0),
			letter("D", 300, 0),
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		for (let i = 0; i < adj.length; i++) {
			for (const j of adj[i]) {
				expect(adj[j]).toContain(i);
			}
		}
	});

	it("includes all pairs within radius and excludes those outside", () => {
		const letters = [
			letter("A", 0, 0),
			letter("B", 50, 0), // close to A
			letter("C", 200, 0), // far
		];
		const adj = buildAdjacency(letters, SEARCH_RADIUS);
		expect(adj[0]).toContain(1);
		expect(adj[0]).not.toContain(2);
		expect(adj[1]).not.toContain(2);
	});
});
