import type { Card } from './types';

export function combinations(arr: Card[], size: number): Card[][] {
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

	return result;
}
