/** One pass over the records, preserving the exact shop isolation of each snapshot. */
export function groupByShop<T extends { lojaId?: string }>(records: Iterable<T>): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const record of records) {
    if (!record.lojaId) continue;
    const group = result.get(record.lojaId);
    if (group) group.push(record);
    else result.set(record.lojaId, [record]);
  }
  return result;
}
