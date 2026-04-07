import { Scene } from "phaser";
import wordsRaw from "../../words.txt?raw";

const LETTER_BAG = "EEEEEEEEEAAAAAARRRRIIIIOOOTTNNNSSSLLDDGGBCMPFHKUVWY";
const SEARCH_RADIUS = 40;
const MIN_WORD_LENGTH = 3;
const PLAY_AREA_TOP = 80; // below score label

type Vec2 = { x: number; y: number };

function dot2(a: Vec2, b: Vec2) { return a.x * b.x + a.y * b.y; }

function gjkDistance(va: Vec2[], vb: Vec2[]): number {
	function support(verts: Vec2[], d: Vec2): Vec2 {
		let best = verts[0], bestDot = dot2(d, verts[0]);
		for (const v of verts) {
			const dd = dot2(d, v);
			if (dd > bestDot) { bestDot = dd; best = v; }
		}
		return best;
	}

	function mink(d: Vec2): Vec2 {
		const a = support(va, d);
		const b = support(vb, { x: -d.x, y: -d.y });
		return { x: a.x - b.x, y: a.y - b.y };
	}

	function closestOnSegment(a: Vec2, b: Vec2): Vec2 {
		const ab = { x: b.x - a.x, y: b.y - a.y };
		const lenSq = dot2(ab, ab);
		if (lenSq < 1e-12) return a;
		const t = Math.max(0, Math.min(1, -dot2(a, ab) / lenSq));
		return { x: a.x + t * ab.x, y: a.y + t * ab.y };
	}

	function nearestSimplex(s: Vec2[]): [Vec2[], Vec2] {
		if (s.length === 1) return [s, s[0]];

		if (s.length === 2) {
			const ab = { x: s[1].x - s[0].x, y: s[1].y - s[0].y };
			const lenSq = dot2(ab, ab);
			if (lenSq < 1e-12) return [[s[0]], s[0]];
			const t = -dot2(s[0], ab) / lenSq;
			if (t <= 0) return [[s[0]], s[0]];
			if (t >= 1) return [[s[1]], s[1]];
			return [s, closestOnSegment(s[0], s[1])];
		}

		// Triangle: check if origin is inside; otherwise find closest edge
		const [A, B, C] = s;
		const cross2 = (u: Vec2, v: Vec2) => u.x * v.y - u.y * v.x;
		const dAB = cross2({ x: B.x - A.x, y: B.y - A.y }, { x: -A.x, y: -A.y });
		const dBC = cross2({ x: C.x - B.x, y: C.y - B.y }, { x: -B.x, y: -B.y });
		const dCA = cross2({ x: A.x - C.x, y: A.y - C.y }, { x: -C.x, y: -C.y });
		if ((dAB >= 0 && dBC >= 0 && dCA >= 0) || (dAB <= 0 && dBC <= 0 && dCA <= 0))
			return [s, { x: 0, y: 0 }];

		let minDist = Infinity, bestSimplex: Vec2[] = [A], bestPoint: Vec2 = A;
		for (const [e0, e1] of [[A, B], [B, C], [C, A]] as [Vec2, Vec2][]) {
			const p = closestOnSegment(e0, e1);
			const d = dot2(p, p);
			if (d < minDist) {
				minDist = d;
				bestPoint = p;
				const ab2 = { x: e1.x - e0.x, y: e1.y - e0.y };
				const ls = dot2(ab2, ab2);
				const t = ls < 1e-12 ? 0 : -dot2(e0, ab2) / ls;
				bestSimplex = t <= 0 ? [e0] : t >= 1 ? [e1] : [e0, e1];
			}
		}
		return [bestSimplex, bestPoint];
	}

	let simplex: Vec2[] = [mink({ x: 1, y: 0 })];
	let [, v] = nearestSimplex(simplex);

	for (let iter = 0; iter < 32; iter++) {
		const vLenSq = dot2(v, v);
		if (vLenSq < 1e-12) return 0;
		const w = mink({ x: -v.x, y: -v.y });
		if (dot2(w, v) >= vLenSq - 1e-8) return Math.sqrt(vLenSq);
		simplex.push(w);
		[simplex, v] = nearestSimplex(simplex);
	}
	return Math.sqrt(dot2(v, v));
}

interface TrieNode {
	children: Map<string, TrieNode>;
	isWord: boolean;
}

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;

	nextLetter: Phaser.GameObjects.Text;
	fallingTexts: Phaser.GameObjects.Text[] = [];
	scoreText: Phaser.GameObjects.Text;
	wordsText: Phaser.GameObjects.Text;
	score: number = 0;
	wordsFormed: number = 0;

	trie: TrieNode;
	isGameOver: boolean = false;
	letterDropTimes: Map<Phaser.GameObjects.Text, number> = new Map();

	constructor() {
		super("Game");
	}

	// Scan the text object's internal canvas to find the tightest rectangle around actual pixels.
	// Returns dimensions in game units (accounts for canvas resolution scaling).
	glyphBounds(text: Phaser.GameObjects.Text): { width: number; height: number } {
		const canvas = text.canvas;
		const ctx = text.context;
		const cw = canvas.width;
		const ch = canvas.height;
		const data = ctx.getImageData(0, 0, cw, ch).data;

		let minX = cw, maxX = 0, minY = ch, maxY = 0;
		for (let y = 0; y < ch; y++) {
			for (let x = 0; x < cw; x++) {
				if (data[(y * cw + x) * 4 + 3] > 10) {
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
		}

		if (minX > maxX) return { width: text.width, height: text.height };

		const scale = cw / text.width;
		return {
			width: (maxX - minX + 1) / scale,
			height: (maxY - minY + 1) / scale,
		};
	}

	addPhysics(text: Phaser.GameObjects.Text) {
		const { width, height } = this.glyphBounds(text);
		return this.matter.add.gameObject(text, {
			shape: { type: "rectangle", width, height },
		});
	}

	buildTrie(words: string[]): TrieNode {
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

	// Find the longest word reachable via neighbor-graph DFS.
	// Each text object may contain multiple characters; all are consumed in order
	// through the trie before exploring that object's neighbors.
	findLongestWord(
		letters: Phaser.GameObjects.Text[],
	): { word: string; path: number[] } | null {
		let best: { word: string; path: number[] } | null = null;

		const dfs = (
			idx: number,
			trieNode: TrieNode,
			word: string,
			path: number[],
			visited: Set<number>,
		) => {
			// Consume all characters of this text object through the trie
			let node = trieNode;
			let consumed = word;
			for (const ch of letters[idx].text) {
				const next = node.children.get(ch);
				if (!next) return;
				consumed += ch;
				node = next;
			}

			const newPath = [...path, idx];

			if (node.isWord && consumed.length >= MIN_WORD_LENGTH) {
				if (!best || consumed.length > best.word.length) {
					best = { word: consumed, path: newPath };
				}
			}

			const curr = letters[idx];
			const cv = (curr.body as MatterJS.BodyType).vertices as MatterJS.Vector[];
			for (let j = 0; j < letters.length; j++) {
				if (visited.has(j)) continue;
				const other = letters[j];
				const ov = (other.body as MatterJS.BodyType).vertices as MatterJS.Vector[];
				if (gjkDistance(cv, ov) <= SEARCH_RADIUS) {
					visited.add(j);
					dfs(j, node, consumed, newPath, visited);
					visited.delete(j);
				}
			}
		};

		for (let i = 0; i < letters.length; i++) {
			const visited = new Set<number>([i]);
			dfs(i, this.trie, "", [], visited);
		}

		return best;
	}

	combineLongestWord() {
		if (this.isGameOver || this.fallingTexts.length === 0) return;

		const result = this.findLongestWord(this.fallingTexts);
		if (!result) return;

		const { word, path } = result;

		// Skip if this is just re-detecting an already-formed word
		if (path.length === 1 && this.fallingTexts[path[0]].text === word) return;

		const pathSet = new Set(path);

		const cx = path.reduce((s, i) => s + this.fallingTexts[i].x, 0) / path.length;
		const cy = path.reduce((s, i) => s + this.fallingTexts[i].y, 0) / path.length;

		// Remove constituent letter objects from physics and scene
		const toRemove = path.map((i) => this.fallingTexts[i]);
		this.fallingTexts = this.fallingTexts.filter((_, i) => !pathSet.has(i));
		for (const t of toRemove) {
			t.destroy();
		}

		// Create combined word object and add to physics
		const ch = Math.max(0, 0x54 - 10 * word.length).toString(16).padStart(2, "0");
		const wordObj = this.add
			.text(cx, cy, word, {
				fontFamily: "Georgia",
				fontSize: Math.max(8, 77 - 5 * word.length),
				color: `#${ch}${ch}${ch}`,
				align: "center",
			})
			.setOrigin(0.5)
			.setDepth(150);

		this.addPhysics(wordObj);
		this.fallingTexts.push(wordObj);

		// Score: longer words = higher score (length²)
		const points = word.length * word.length;
		this.score += points;
		this.wordsFormed++;
		this.scoreText.setText(`Score: ${this.score}`);
		this.wordsText.setText(`Words: ${this.wordsFormed}`);

		// Floating score popup
		const popup = this.add
			.text(cx, cy - 30, `${word} +${points}`, {
				fontFamily: "Georgia",
				fontSize: 28,
				color: "#2a7a2a",
				fontStyle: "bold",
			})
			.setOrigin(0.5)
			.setDepth(400);

		this.tweens.add({
			targets: popup,
			y: cy - 100,
			alpha: 0,
			duration: 1200,
			ease: "Power2",
			onComplete: () => popup.destroy(),
		});
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0xf5f0e8);
		this.isGameOver = false;
		this.score = 0;
		this.wordsFormed = 0;
		this.fallingTexts = [];
		this.letterDropTimes = new Map();

		const words = wordsRaw.trim().split(/\r?\n/);
		this.trie = this.buildTrie(words);

		this.scoreText = this.add
			.text(16, 16, "Score: 0", {
				fontFamily: "Georgia",
				fontSize: 36,
				color: "#4a4a4a",
			})
			.setDepth(200);

		this.wordsText = this.add
			.text(16, 56, "Words: 0", {
				fontFamily: "Georgia",
				fontSize: 20,
				color: "#7a7a7a",
			})
			.setDepth(200);

		// Physics boundaries — top wall sits just below the score label
		const w = this.scale.width;
		const h = this.scale.height;
		const thick = 50;
		this.matter.add.rectangle(w / 2, h + thick / 2, w + thick * 2, thick, { isStatic: true }); // bottom
		this.matter.add.rectangle(-thick / 2, h / 2, thick, h * 2, { isStatic: true }); // left
		this.matter.add.rectangle(w + thick / 2, h / 2, thick, h * 2, { isStatic: true }); // right

		this.time.addEvent({
			delay: 200,
			callback: this.combineLongestWord,
			callbackScope: this,
			loop: true,
		});

		this.createNextLetter();

		this.input.on("pointerup", () => {
			if (!this.isGameOver) this.dropNextLetter();
		});
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (!this.isGameOver) this.nextLetter.x = pointer.x;
		});
	}

	update() {
		if (this.isGameOver) return;

		for (const t of this.fallingTexts) {
			if (t.y < PLAY_AREA_TOP) {
				const dropTime = this.letterDropTimes.get(t) ?? 0;
				if (this.time.now - dropTime < 400) continue;
				this.triggerGameOver();
				return;
			}
		}
	}

	triggerGameOver() {
		this.isGameOver = true;

		if (this.nextLetter) {
			this.nextLetter.destroy();
		}

		const w = this.scale.width;
		const h = this.scale.height;

		// Dim overlay
		this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55).setDepth(300);

		this.add
			.text(w / 2, h / 2 - 90, "Game Over", {
				fontFamily: "Georgia",
				fontSize: 64,
				color: "#ffffff",
			})
			.setOrigin(0.5)
			.setDepth(301);

		this.add
			.text(w / 2, h / 2 - 20, `Score: ${this.score}`, {
				fontFamily: "Georgia",
				fontSize: 40,
				color: "#f5f0e8",
			})
			.setOrigin(0.5)
			.setDepth(301);

		const btnBg = this.add
			.rectangle(w / 2, h / 2 + 80, 220, 64, 0xf5f0e8)
			.setDepth(301)
			.setInteractive({ cursor: "pointer" });

		this.add
			.text(w / 2, h / 2 + 80, "Play Again", {
				fontFamily: "Georgia",
				fontSize: 32,
				color: "#333333",
			})
			.setOrigin(0.5)
			.setDepth(302);

		btnBg.on("pointerup", () => {
			this.scene.restart();
		});
	}

	public createNextLetter() {
		const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
		this.nextLetter = this.add
			.text(this.input.x, 100, letter, {
				fontFamily: "Georgia",
				fontSize: 72,
				color: "#4a4a4a",
				align: "center",
			})
			.setOrigin(0.5)
			.setDepth(200);
	}

	public dropNextLetter() {
		this.nextLetter.y = PLAY_AREA_TOP;
		this.addPhysics(this.nextLetter);
		this.letterDropTimes.set(this.nextLetter, this.time.now);
		this.fallingTexts.push(this.nextLetter);
		this.createNextLetter();
	}
}
