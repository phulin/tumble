import { describe, expect, it } from "vitest";
import { gjkDistance, type Vec2 } from "./gjk";

// ────────────────────────────────────────────────────────────
// Helpers: build rectangle vertex lists
// ────────────────────────────────────────────────────────────

/** Axis-aligned rectangle centered at (cx, cy). */
function rect(cx: number, cy: number, w: number, h: number): Vec2[] {
	const hw = w / 2, hh = h / 2;
	return [
		{ x: cx - hw, y: cy - hh },
		{ x: cx + hw, y: cy - hh },
		{ x: cx + hw, y: cy + hh },
		{ x: cx - hw, y: cy + hh },
	];
}

/** Rectangle centered at (cx, cy), rotated by `angle` radians. */
function rotRect(cx: number, cy: number, w: number, h: number, angle: number): Vec2[] {
	const hw = w / 2, hh = h / 2;
	const cos = Math.cos(angle), sin = Math.sin(angle);
	const locals: Vec2[] = [
		{ x: -hw, y: -hh },
		{ x: hw, y: -hh },
		{ x: hw, y: hh },
		{ x: -hw, y: hh },
	];
	return locals.map(({ x, y }) => ({
		x: cx + x * cos - y * sin,
		y: cy + x * sin + y * cos,
	}));
}

/** Brute-force distance between two convex polygons (for verification). */
function bruteForceDistance(va: Vec2[], vb: Vec2[]): number {
	function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
		const abx = b.x - a.x, aby = b.y - a.y;
		const lenSq = abx * abx + aby * aby;
		if (lenSq < 1e-12) {
			const dx = p.x - a.x, dy = p.y - a.y;
			return Math.sqrt(dx * dx + dy * dy);
		}
		let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
		t = Math.max(0, Math.min(1, t));
		const cx = a.x + t * abx, cy = a.y + t * aby;
		const dx = p.x - cx, dy = p.y - cy;
		return Math.sqrt(dx * dx + dy * dy);
	}
	function polyContainsPoint(poly: Vec2[], p: Vec2): boolean {
		// Assumes convex polygon, consistent winding.
		let sign = 0;
		for (let i = 0; i < poly.length; i++) {
			const a = poly[i], b = poly[(i + 1) % poly.length];
			const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
			if (Math.abs(cross) < 1e-12) continue;
			const s = cross > 0 ? 1 : -1;
			if (sign === 0) sign = s;
			else if (sign !== s) return false;
		}
		return true;
	}
	// If any vertex of one polygon is inside the other, distance is 0.
	for (const p of va) if (polyContainsPoint(vb, p)) return 0;
	for (const p of vb) if (polyContainsPoint(va, p)) return 0;

	let min = Infinity;
	for (let i = 0; i < va.length; i++) {
		const a0 = va[i], a1 = va[(i + 1) % va.length];
		for (let j = 0; j < vb.length; j++) {
			const b0 = vb[j], b1 = vb[(j + 1) % vb.length];
			min = Math.min(min, distPointSeg(a0, b0, b1));
			min = Math.min(min, distPointSeg(a1, b0, b1));
			min = Math.min(min, distPointSeg(b0, a0, a1));
			min = Math.min(min, distPointSeg(b1, a0, a1));
		}
	}
	return min;
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("gjkDistance: basic axis-aligned cases", () => {
	it("two separated rectangles, horizontal", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(20, 0, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(10);
	});

	it("two separated rectangles, vertical", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(0, 20, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(10);
	});

	it("two separated rectangles, diagonal", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(20, 20, 10, 10);
		// Corner of A at (5,5), corner of B at (15,15), distance = sqrt(200)
		expect(gjkDistance(a, b)).toBeCloseTo(Math.sqrt(200));
	});

	it("touching rectangles (edge-edge)", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(10, 0, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("touching rectangles (corner-corner)", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(10, 10, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("overlapping rectangles", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(5, 5, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("containing rectangles", () => {
		const a = rect(0, 0, 20, 20);
		const b = rect(0, 0, 5, 5);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("identical rectangles", () => {
		const a = rect(0, 0, 10, 10);
		const b = rect(0, 0, 10, 10);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});
});

describe("gjkDistance: rotated cases", () => {
	it("both rectangles rotated 45°, separated", () => {
		const a = rotRect(0, 0, 10, 10, Math.PI / 4);
		const b = rotRect(30, 0, 10, 10, Math.PI / 4);
		// Diamond shape tip-to-tip
		const expected = 30 - 2 * Math.sqrt(50);
		expect(gjkDistance(a, b)).toBeCloseTo(expected);
	});

	it("rectangle vs 45°-rotated rectangle", () => {
		const a = rect(0, 0, 10, 10);
		const b = rotRect(20, 0, 10, 10, Math.PI / 4);
		// A's right edge at x=5, B's leftmost point at x=20-sqrt(50)
		const expected = 20 - Math.sqrt(50) - 5;
		expect(gjkDistance(a, b)).toBeCloseTo(expected);
	});

	it("rotated rectangles touching", () => {
		const a = rotRect(0, 0, 10, 10, 0.3);
		const b = rotRect(0, 0, 10, 10, -0.3);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("small rotation side-by-side matches brute force", () => {
		const a = rotRect(0, 0, 50, 60, 0.1);
		const b = rotRect(60, 0, 50, 60, 0.1);
		const expected = bruteForceDistance(a, b);
		expect(gjkDistance(a, b)).toBeCloseTo(expected, 3);
	});

	it("various small rotations at various offsets match brute force", () => {
		const angles = [0.05, 0.1, 0.2, 0.3, -0.15, -0.25];
		const offsets = [55, 60, 65, 70, 80, 100];
		for (const angle of angles) {
			for (const off of offsets) {
				const a = rotRect(0, 0, 50, 60, angle);
				const b = rotRect(off, 0, 50, 60, -angle);
				const expected = bruteForceDistance(a, b);
				expect(gjkDistance(a, b)).toBeCloseTo(expected, 3);
			}
		}
	});
});

describe("gjkDistance: cases resembling the DOVE failure", () => {
	it("two rotated letter-sized rects at typical adjacent spacing", () => {
		const a = rotRect(0, 0, 40, 50, 0.3);
		const b = rotRect(45, 0, 40, 50, -0.2);
		const expected = bruteForceDistance(a, b);
		expect(gjkDistance(a, b)).toBeCloseTo(expected, 3);
	});

	it("letter-sized rects at 4 different positions & rotations", () => {
		// Simulating D, O, V, E positions in a chain
		const boxes = [
			rotRect(100, 100, 40, 50, 0.2),
			rotRect(145, 105, 40, 50, -0.3),
			rotRect(190, 95, 40, 50, 0.15),
			rotRect(235, 100, 40, 50, -0.1),
		];
		for (let i = 0; i < boxes.length - 1; i++) {
			const expected = bruteForceDistance(boxes[i], boxes[i + 1]);
			expect(gjkDistance(boxes[i], boxes[i + 1])).toBeCloseTo(expected, 3);
		}
	});

	it("interpenetrating rotated rectangles return 0", () => {
		const a = rotRect(0, 0, 50, 60, 0.4);
		const b = rotRect(20, 10, 50, 60, -0.3);
		expect(gjkDistance(a, b)).toBeCloseTo(0);
	});

	it("rotated rect at arbitrary angle vs translated copy", () => {
		const a = rotRect(0, 0, 54, 72, 0.7);
		const b = rotRect(80, 5, 54, 72, 0.7);
		const expected = bruteForceDistance(a, b);
		expect(gjkDistance(a, b)).toBeCloseTo(expected, 3);
	});
});

describe("gjkDistance: stress test vs brute force", () => {
	it("100 random rotated rectangle pairs agree with brute force", () => {
		let seed = 12345;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed / 0x7fffffff;
		};
		for (let i = 0; i < 100; i++) {
			const ax = (rand() - 0.5) * 200;
			const ay = (rand() - 0.5) * 200;
			const bx = (rand() - 0.5) * 200;
			const by = (rand() - 0.5) * 200;
			const aw = 20 + rand() * 60;
			const ah = 20 + rand() * 60;
			const bw = 20 + rand() * 60;
			const bh = 20 + rand() * 60;
			const aRot = (rand() - 0.5) * Math.PI;
			const bRot = (rand() - 0.5) * Math.PI;
			const a = rotRect(ax, ay, aw, ah, aRot);
			const b = rotRect(bx, by, bw, bh, bRot);
			const expected = bruteForceDistance(a, b);
			expect(gjkDistance(a, b)).toBeCloseTo(expected, 3);
		}
	});
});
