const STORAGE_KEY = "item_variations_v1";

export type ItemVariation = {
  id: string;
  name: string;
  unit_price: number;
  default_quantity: number;
};

type VariationsStore = Record<string, ItemVariation[]>;

function readStore(): VariationsStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as VariationsStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: VariationsStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event("item-variations-changed"));
  } catch {
    // ignore quota errors
  }
}

export function getItemVariations(itemId: string | undefined | null): ItemVariation[] {
  if (!itemId) return [];
  const store = readStore();
  return store[String(itemId)] ?? [];
}

export function hasItemVariations(itemId: string | undefined | null): boolean {
  return getItemVariations(itemId).length > 0;
}

export function setItemVariations(itemId: string, variations: ItemVariation[]) {
  const store = readStore();
  if (variations.length === 0) {
    delete store[String(itemId)];
  } else {
    store[String(itemId)] = variations;
  }
  writeStore(store);
}

export function clearItemVariations(itemId: string) {
  setItemVariations(itemId, []);
}

export function makeVariationId(): string {
  return `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
