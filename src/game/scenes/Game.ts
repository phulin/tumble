import { Scene } from "phaser";
import wordsRaw from "../../words.txt?raw";
import { gjkDistance } from "../gjk";

const LETTER_BAG = "EEEEEEEEEAAAAAARRRRIIIIOOOTTNNNSSSLLDDGGBCMPFHKUVWY";
const SEARCH_RADIUS = 60;
const MIN_WORD_LENGTH = 3;
const PLAY_AREA_TOP = 80; // below score label
const TEXT_RESOLUTION = window.devicePixelRatio || 1;

interface TrieNode {
	children: Map<string, TrieNode>;
	isWord: boolean;
}

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;

	wallBodies: MatterJS.BodyType[] = [];
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
	glyphBounds(text: Phaser.GameObjects.Text): {
		width: number;
		height: number;
	} {
		const canvas = text.canvas;
		const ctx = text.context;
		const cw = canvas.width;
		const ch = canvas.height;
		const data = ctx.getImageData(0, 0, cw, ch).data;

		let minX = cw,
			maxX = 0,
			minY = ch,
			maxY = 0;
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
		const n = letters.length;

		// Precompute adjacency list once. Broad-phase AABB reject before GJK.
		const bodies = letters.map((t) => t.body as MatterJS.BodyType);
		const bounds = bodies.map((b) => b.bounds);
		const vertsList = bodies.map((b) => b.vertices as MatterJS.Vector[]);
		const adj: number[][] = [];
		for (let i = 0; i < n; i++) adj.push([]);
		for (let i = 0; i < n; i++) {
			const bi = bounds[i];
			for (let j = i + 1; j < n; j++) {
				const bj = bounds[j];
				// AABB broad-phase: skip if expanded boxes don't overlap
				if (
					bi.max.x + SEARCH_RADIUS < bj.min.x ||
					bj.max.x + SEARCH_RADIUS < bi.min.x ||
					bi.max.y + SEARCH_RADIUS < bj.min.y ||
					bj.max.y + SEARCH_RADIUS < bi.min.y
				) continue;
				if (gjkDistance(vertsList[i], vertsList[j]) <= SEARCH_RADIUS) {
					adj[i].push(j);
					adj[j].push(i);
				}
			}
		}

		let best: { word: string; path: number[] } | null = null;
		const visited = new Uint8Array(n);
		const path: number[] = [];

		const dfs = (idx: number, trieNode: TrieNode, word: string) => {
			// Consume all characters of this text object through the trie
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
			if (node.isWord && consumed.length >= MIN_WORD_LENGTH && !isTrivialReDetect) {
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
			dfs(i, this.trie, "");
			visited[i] = 0;
		}

		return best;
	}

	combineLongestWord() {
		if (this.isGameOver || this.fallingTexts.length === 0) return;

		const result = this.findLongestWord(this.fallingTexts);
		if (!result) return;

		const { word, path } = result;
		const pathSet = new Set(path);

		const cx =
			path.reduce((s, i) => s + this.fallingTexts[i].x, 0) / path.length;
		const cy =
			path.reduce((s, i) => s + this.fallingTexts[i].y, 0) / path.length;

		// Remove constituent letter objects from physics and scene
		const toRemove = path.map((i) => this.fallingTexts[i]);
		this.fallingTexts = this.fallingTexts.filter((_, i) => !pathSet.has(i));
		for (const t of toRemove) {
			t.destroy();
		}

		// Create combined word object and add to physics
		const ch = Math.max(0, 0x54 - 10 * word.length)
			.toString(16)
			.padStart(2, "0");
		const wordObj = this.add
			.text(cx, cy, word, {
				fontFamily: "Georgia",
				fontSize: Math.max(14, 77 - 5 * word.length),
				color: `#${ch}${ch}${ch}`,
				align: "center",
				resolution: TEXT_RESOLUTION,
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
				resolution: TEXT_RESOLUTION,
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

	createBoundaries() {
		// Remove old walls
		for (const body of this.wallBodies) {
			this.matter.world.remove(body);
		}
		this.wallBodies = [];

		const w = this.scale.width;
		const h = this.scale.height;
		const thick = 50;

		this.wallBodies.push(
			this.matter.add.rectangle(w / 2, h + thick / 2, w + thick * 2, thick, { isStatic: true }),
			this.matter.add.rectangle(-thick / 2, h / 2, thick, h * 2, { isStatic: true }),
			this.matter.add.rectangle(w + thick / 2, h / 2, thick, h * 2, { isStatic: true }),
		);
	}

	create() {
		this.camera = this.cameras.main;
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
				resolution: TEXT_RESOLUTION,
			})
			.setDepth(200);

		this.wordsText = this.add
			.text(16, 56, "Words: 0", {
				fontFamily: "Georgia",
				fontSize: 20,
				color: "#7a7a7a",
				resolution: TEXT_RESOLUTION,
			})
			.setDepth(200);

			this.createBoundaries();

		this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
			this.camera.setSize(gameSize.width, gameSize.height);
			this.createBoundaries();
		});

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
				resolution: TEXT_RESOLUTION,
			})
			.setOrigin(0.5)
			.setDepth(301);

		this.add
			.text(w / 2, h / 2 - 20, `Score: ${this.score}`, {
				fontFamily: "Georgia",
				fontSize: 40,
				color: "#f5f0e8",
				resolution: TEXT_RESOLUTION,
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
				resolution: TEXT_RESOLUTION,
			})
			.setOrigin(0.5)
			.setDepth(302);

		btnBg.on("pointerup", () => {
			this.scene.restart();
		});
	}

	public createNextLetter() {
		const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
		const angle = Phaser.Math.Between(-15, 15);
		this.nextLetter = this.add
			.text(this.input.x, 100, letter, {
				fontFamily: "Georgia",
				fontSize: 72,
				color: "#4a4a4a",
				align: "center",
				resolution: TEXT_RESOLUTION,
			})
			.setOrigin(0.5)
			.setDepth(200)
			.setAngle(angle)
			.setScale(0)
			.setAlpha(0);

		this.tweens.add({
			targets: this.nextLetter,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: 200,
			ease: "Back.easeOut",
		});
	}

	public dropNextLetter() {
		const angle = this.nextLetter.angle;
		this.nextLetter.y = PLAY_AREA_TOP;
		this.addPhysics(this.nextLetter);
		const body = (this.nextLetter as any).body as MatterJS.BodyType;
		this.matter.body.setAngle(body, Phaser.Math.DegToRad(angle));
		this.letterDropTimes.set(this.nextLetter, this.time.now);
		this.fallingTexts.push(this.nextLetter);
		this.createNextLetter();
	}
}
