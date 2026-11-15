/** Largest remainders reconcile every cent to the receipt, including ties. */
export function splitCharge(weights: number[], cents: number): number[] {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!sum || !cents) return weights.map(() => 0);
  const products = weights.map(weight => BigInt(weight) * BigInt(cents));
  const divisor = BigInt(sum);
  const shares = products.map(product => Number(product / divisor));
  const ranked = products.map((product, index) => ({ index, remainder: product % divisor }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const leftover = cents - shares.reduce((total, share) => total + share, 0);
  for (const { index } of ranked.slice(0, leftover)) shares[index]++;
  return shares;
}
