const DIACRITICS_REGEX = /[̀-ͯ]/g;

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isDuplicateName(
  name: string,
  existing: ReadonlyArray<{ name: string; id?: string | number | null }>,
  ignoreId?: string | number | null,
): boolean {
  const key = normalizeName(name);
  if (!key) return false;
  return existing.some(
    (entry) =>
      String(entry.id ?? "") !== String(ignoreId ?? "") &&
      normalizeName(entry.name) === key,
  );
}
