import { useEffect, useMemo } from "react";
import { useFormContext, useWatch, type FieldValues } from "react-hook-form";
import {
  getDerivedItemRules,
  getParticipationQuantity,
  resolveRuleQuantity,
} from "../../data/runtimeBudgetRules";
import type { BudgetCatalogEvent, BudgetCatalogItem } from "../../data/budgetCatalog";

/**
 * Mantém as quantidades derivadas (dinâmicas por participantes / regras de
 * quantidade) sincronizadas no formulário, independente do step ativo.
 *
 * Sem isto, a recalibração só acontecia ao montar o ItemsStep (step 2), então
 * editar a participação no step 1 e salvar direto no resumo gerava uma versão
 * com totais defasados — refletidos no card do orçamento. Esta lógica é a mesma
 * do efeito de sincronização do ItemsStep, extraída para rodar sempre.
 */
export function useBudgetDerivedQuantitySync(budgetEvents: BudgetCatalogEvent[]) {
  const { control, setValue, formState } = useFormContext();
  const selectedEventIds = (useWatch({ control, name: "selectedEvents" }) || []) as string[];
  const formValues = useWatch({ control }) as FieldValues;

  const derivedRuleByEventItem = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getDerivedItemRules>[number]["quantity"]>();
    getDerivedItemRules().forEach((rule) => {
      map.set(`${rule.eventId}::${rule.itemId}`, rule.quantity);
    });
    return map;
  }, []);

  useEffect(() => {
    const selectedEvents = budgetEvents.filter((event) => selectedEventIds.includes(event.id));

    const getParticipationQty = (eventId: string): number => {
      const fallback = Number(formValues?.studentsQuantity) || 1;
      return (
        getParticipationQuantity(formValues as Record<string, unknown>, eventId, fallback) || fallback
      );
    };

    const itemsDirty = (formState.dirtyFields as Record<string, unknown> | undefined)?.items as
      | Record<string, unknown>
      | undefined;
    const isItemQtyDirty = (eventId: string, itemId: string) =>
      Boolean((itemsDirty?.[eventId] as Record<string, unknown> | undefined)?.[itemId]);

    const getItemRaw = (eventId: string, itemKey: string): unknown =>
      ((formValues?.items?.[eventId] ?? {}) as Record<string, unknown>)[itemKey];

    selectedEvents.forEach((event) => {
      const participationQty = getParticipationQty(event.id);
      event.items.forEach((rawItem) => {
        const item = rawItem as BudgetCatalogItem;
        if (item.isHeader) return;

        const additional =
          item.hasAdditional && Number.isFinite(Number(item.additionalQuantity))
            ? Math.max(0, Math.floor(Number(item.additionalQuantity)))
            : 0;
        const multiplier =
          item.hasMultiplier &&
          Number.isFinite(Number(item.multiplierQuantity)) &&
          Number(item.multiplierQuantity) > 0
            ? Math.floor(Number(item.multiplierQuantity))
            : 1;
        const applyRules = (base: number) => base * multiplier + additional;

        const rule = item.quantityRule ?? derivedRuleByEventItem.get(`${event.id}::${item.id}`);
        const derivedDefaultQty = rule ? applyRules(resolveRuleQuantity(participationQty, rule)) : null;

        const isDynamic =
          derivedDefaultQty !== null ||
          Boolean(item.dynamicByStudents) ||
          Boolean(item.hasMultiplier) ||
          Boolean(item.hasAdditional);

        const computedQty =
          derivedDefaultQty ??
          (item.dynamicByStudents
            ? applyRules(participationQty)
            : item.defaultQuantity !== undefined
              ? applyRules(item.defaultQuantity)
              : undefined);

        if (computedQty === undefined) return;
        if (isItemQtyDirty(event.id, item.id)) return;

        if (isDynamic) {
          const currentRaw = getItemRaw(event.id, item.id);
          const currentNum =
            currentRaw === "" || currentRaw === undefined || currentRaw === null
              ? null
              : Number(currentRaw);
          if (currentNum === computedQty) return;
          setValue(`items.${event.id}.${item.id}`, computedQty, {
            shouldDirty: false,
            shouldValidate: false,
          });
          return;
        }

        const currentValue = getItemRaw(event.id, item.id);
        if (currentValue !== undefined && currentValue !== null && currentValue !== "") return;
        setValue(`items.${event.id}.${item.id}`, computedQty, {
          shouldDirty: false,
          shouldValidate: false,
        });
      });
    });
  }, [budgetEvents, selectedEventIds, formValues, formState.dirtyFields, setValue, derivedRuleByEventItem]);
}

interface BudgetDerivedQuantitySyncProps {
  budgetEvents: BudgetCatalogEvent[];
}

/** Componente sem renderização: roda a sincronização dentro do FormProvider. */
export function BudgetDerivedQuantitySync({ budgetEvents }: BudgetDerivedQuantitySyncProps) {
  useBudgetDerivedQuantitySync(budgetEvents);
  return null;
}
