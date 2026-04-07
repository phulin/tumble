import { Scene } from "phaser";
import wordsRaw from "../../words.txt?raw";

const LETTER_BAG = "EEEEEEEEEAAAAAARRRRIIIIOOOTTNNNSSSLLDDGGBCMPFHKUVWY";
const SEARCH_RADIUS = 100;
const MIN_WORD_LENGTH = 3;
const PLAY_AREA_TOP = 80; // below score label

interface TrieNode {
	children: Map<string, TrieNode>;
	isWord: boolean;
}

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;

	nextLetter: Phaser.GameObjects.Text;
	fallingTexts: Phaser.GameObjects.Text[] = [];
	scoreText: Phaser.GameObjects.Text;
	score: number = 0;

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
			for (let j = 0; j < letters.length; j++) {
				if (visited.has(j)) continue;
				const other = letters[j];
				const dx = other.x - curr.x;
				const dy = other.y - curr.y;
				if (dx * dx + dy * dy <= SEARCH_RADIUS * SEARCH_RADIUS) {
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
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0xf5f0e8);
		this.isGameOver = false;
		this.score = 0;
		this.fallingTexts = [];
		this.letterDropTimes = new Map();

		const words = wordsRaw.trim().split(/\r?\n/);
		this.trie = this.buildTrie(words);

		this.scoreText = this.add
			.text(16, 16, "Dropped: 0", {
				fontFamily: "Georgia",
				fontSize: 36,
				color: "#4a4a4a",
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
			delay: 100,
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
		this.score++;
		this.scoreText.setText(`Dropped: ${this.score}`);
		this.createNextLetter();
	}
}
