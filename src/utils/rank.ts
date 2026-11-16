/**
 * Standard competition ranking ("1224"): equal values share a rank and the
 * next rank skips. Expects `items` to already be sorted best-first; returns
 * a rank (1-based) for each index.
 *
 * e.g. scores [4, 3, 3, 1] -> [1, 2, 2, 4]
 */
export function competitionRanks<T>(items: readonly T[], getValue: (item: T) => number): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && getValue(items[i]) === getValue(items[i - 1])) {
      ranks.push(ranks[i - 1]);
    } else {
      ranks.push(i + 1);
    }
  }
  return ranks;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st", ... */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Joins names for a tie banner: "a", "a & b", "a, b & c". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
