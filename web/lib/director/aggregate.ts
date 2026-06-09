export interface DirectorRow { title: string; name: string; currentShares: number; }

export function aggregateByShares(rows: DirectorRow[], outstandingShares: number): number {
  if (!(outstandingShares > 0)) throw new Error('outstandingShares must be > 0');
  const total = rows.reduce((s, r) => s + r.currentShares, 0);
  return (total / outstandingShares) * 100;
}
