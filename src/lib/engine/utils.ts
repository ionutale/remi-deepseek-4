import type { Card } from './types';

const memo = new Map<string, Card[][]>();
const MAX_CACHE = 50_000;

export function combinations(arr: Card[], size: number): Card[][] {
	const key = `${arr.map((c) => c.id).join(',')}-${size}`;
	const cached = memo.get(key);
	if (cached) return cached;

	if (size === 0) return [[]];
	if (arr.length < size) return [];

	const result: Card[][] = [];
	const [first, ...rest] = arr;

	for (const combo of combinations(rest, size - 1)) {
		result.push([first, ...combo]);
	}
	for (const combo of combinations(rest, size)) {
		result.push(combo);
	}

	if (memo.size < MAX_CACHE) memo.set(key, result);
	return result;
}

export function clearCombinationsCache(): void {
	memo.clear();
}
