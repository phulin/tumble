export type Vec2 = { x: number; y: number };

function dot2(a: Vec2, b: Vec2) {
	return a.x * b.x + a.y * b.y;
}

export function gjkDistance(va: Vec2[], vb: Vec2[]): number {
	function support(verts: Vec2[], d: Vec2): Vec2 {
		let best = verts[0],
			bestDot = dot2(d, verts[0]);
		for (const v of verts) {
			const dd = dot2(d, v);
			if (dd > bestDot) {
				bestDot = dd;
				best = v;
			}
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
		if (
			(dAB >= 0 && dBC >= 0 && dCA >= 0) ||
			(dAB <= 0 && dBC <= 0 && dCA <= 0)
		)
			return [s, { x: 0, y: 0 }];

		let minDist = Infinity,
			bestSimplex: Vec2[] = [A],
			bestPoint: Vec2 = A;
		for (const [e0, e1] of [
			[A, B],
			[B, C],
			[C, A],
		] as [Vec2, Vec2][]) {
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
