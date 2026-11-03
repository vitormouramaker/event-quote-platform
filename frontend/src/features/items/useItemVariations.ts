import { useEffect, useState } from "react";
import { getItemVariations, type ItemVariation } from "./variationsStorage";

export function useItemVariations(itemId: string | undefined | null): ItemVariation[] {
  const [variations, setVariations] = useState<ItemVariation[]>(() => getItemVariations(itemId));

  useEffect(() => {
    setVariations(getItemVariations(itemId));

    const handler = () => setVariations(getItemVariations(itemId));
    window.addEventListener("item-variations-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("item-variations-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [itemId]);

  return variations;
}
