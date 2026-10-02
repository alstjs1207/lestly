/** Normalize pagination before building a database range. */
export function normalizePagination(page = 1, pageSize = 20) {
  const safePage =
    Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
  const safePageSize =
    Number.isSafeInteger(pageSize) && pageSize >= 1
      ? Math.min(pageSize, 100)
      : 20;

  return {
    page: safePage,
    pageSize: safePageSize,
    from: (safePage - 1) * safePageSize,
    to: safePage * safePageSize - 1,
  };
}

/** Quote values used inside PostgREST's raw OR grammar. */
export function buildStudentSearchFilter(search: string) {
  const value = search.trim().slice(0, 100);
  if (!value) return null;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = `"%${escaped}%"`;
  return `name.ilike.${pattern},phone.ilike.${pattern}`;
}

/** Read all rows of a bounded query instead of accepting the API row cap. */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: unknown;
  }>,
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
