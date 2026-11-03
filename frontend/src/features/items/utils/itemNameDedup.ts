type NamedItem = {
  name: string;
  slug?: string | null;
  sourceEventTitle?: string;
};

function normalizeLooseText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getDisplayItemName(name: string) {
  const trimmed = name.trim();
  const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stripped || trimmed;
}

export function normalizeItemNameKey(name: string) {
  return normalizeLooseText(getDisplayItemName(name));
}

export function matchesItemSearch(name: string, searchTerm: string) {
  const normalizedTerm = normalizeLooseText(searchTerm);
  if (!normalizedTerm) return true;

  const rawName = normalizeLooseText(name);
  const displayName = normalizeItemNameKey(name);
  return rawName.includes(normalizedTerm) || displayName.includes(normalizedTerm);
}

function getItemRank(item: NamedItem) {
  const hasSuffix = getDisplayItemName(item.name) !== item.name.trim();
  const isBaseItem = item.sourceEventTitle === "Itens Base";
  const hasSlug = typeof item.slug === "string" && item.slug.trim().length > 0;

  return [hasSuffix ? 1 : 0, isBaseItem ? 0 : 1, hasSlug ? 0 : 1, item.name.length];
}

function compareRank(left: number[], right: number[]) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function dedupeItemsByNormalizedName<T extends NamedItem>(items: T[]) {
  const bestByKey = new Map<string, { item: T; index: number; rank: number[] }>();

  items.forEach((item, index) => {
    const key = normalizeItemNameKey(item.name);
    const candidate = { item, index, rank: getItemRank(item) };
    const current = bestByKey.get(key);

    if (!current || compareRank(candidate.rank, current.rank) < 0) {
      bestByKey.set(key, candidate);
    }
  });

  return Array.from(bestByKey.values())
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);
}
