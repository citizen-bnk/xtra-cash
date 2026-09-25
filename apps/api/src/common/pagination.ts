export function pageParams(q: { page?: string | number; pageSize?: string | number }) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize };
}

export function sanitizeUser<T extends { passwordHash?: string }>(u: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}
