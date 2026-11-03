import { useMemo, useState } from "react";
import React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldValues } from "react-hook-form";
import { v4 as uuidv4 } from "uuid";
import { Trash2 } from "lucide-react";
import { Button } from "../../../../components/Button/Button";
import { Input } from "../../../../components/Input/Input";
import type { ItemVariationDto } from "../../../../services/api";
import type { BudgetItem } from "../../data/mockData";
import {
  getVariationDrivenQuantity,
  getVariationDrivenUnitPrice,
} from "../../domain/itemVariations";
import { deriveAddedItemBehavior } from "./addedItemBehavior";
import {
  dedupeItemsByNormalizedName,
  getDisplayItemName,
  matchesItemSearch,
} from "../../../items/utils/itemNameDedup";

export type AddableBudgetItemUi = BudgetItem & {
  sourceEventId?: string;
  sourceEventTitle?: string;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  dynamicByStudents?: boolean;
  hasAdditional?: boolean;
  additionalQuantity?: number;
  hasMultiplier?: boolean;
  multiplierQuantity?: number;
  variations?: ItemVariationDto[];
};

export type ItemsStepCustomAddedItemUi = {
  id?: string;
  name?: string;
  unitPrice?: number;
  quantity?: number;
  isNoFixedValue?: boolean;
  originalId?: string;
  originalEventId?: string;
  hasSubitems?: boolean;
  selectedVariationId?: string;
  variations?: ItemVariationDto[];
  subitems?: Array<{
    name: string;
  }>;
};

type RHFPriceInputProps = {
  name: string;
  control: Control<FieldValues>;
  defaultValue?: number;
  className?: string;
  readOnly?: boolean;
};

function formatPriceInputValue(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function RHFPriceInput({ name, control, defaultValue, className, readOnly }: RHFPriceInputProps) {
  if (readOnly) {
    return (
      <Controller
        name={name}
        control={control}
        defaultValue={defaultValue}
        render={({ field: { value } }) => (
          <>
            <input type="hidden" value={value ?? defaultValue ?? 0} readOnly />
            <span style={{ fontSize: "14px", color: "var(--color-text-main)" }}>
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? defaultValue) || 0)}
            </span>
          </>
        )}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "13px", color: "var(--color-text-muted)", userSelect: "none", flexShrink: 0 }}>
        R$
      </span>
      <Controller
        name={name}
        control={control}
        defaultValue={defaultValue}
        render={({ field: { onChange, onBlur, value } }) => {
          const initVal = value !== undefined ? value : defaultValue;
          const [displayVal, setDisplayVal] = React.useState(formatPriceInputValue(Number(initVal) || 0));

          React.useEffect(() => {
            if (
              value !== undefined &&
              Number(value) !== parseFloat(displayVal.replace(/\./g, "").replace(",", "."))
            ) {
              setDisplayVal(formatPriceInputValue(Number(value) || 0));
            }
          }, [value, displayVal]);

          return (
            <Input
              type="text"
              className={className}
              value={displayVal}
              onChange={(e) => {
                const textVal = e.target.value.replace(/[^0-9,-]/g, "");
                setDisplayVal(textVal);
                const cleanVal = textVal.replace(",", ".");
                const numericVal = parseFloat(cleanVal) || 0;
                onChange(numericVal);
              }}
              onBlur={(e) => {
                const textVal = e.target.value.replace(/[^0-9,-]/g, "").replace(",", ".");
                const numericVal = parseFloat(textVal) || 0;
                setDisplayVal(formatPriceInputValue(numericVal));
                onBlur();
              }}
            />
          );
        }}
      />
    </div>
  );
}

type AddItemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: ItemsStepCustomAddedItemUi) => void;
  availableItems: AddableBudgetItemUi[];
  targetParticipationQty: number;
};

type PriceFilter = "todos" | "pago" | "sem_valor";

function matchesPriceFilter(item: AddableBudgetItemUi, filter: PriceFilter): boolean {
  if (filter === "todos") return true;
  const isPaid = item.unitPrice > 0 && !item.displayValue;
  return filter === "pago" ? isPaid : !isPaid;
}

export function AddItemModal({
  isOpen,
  onClose,
  onAdd,
  availableItems,
  targetParticipationQty,
}: AddItemModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("todos");
  const [selectedItem, setSelectedItem] = useState<AddableBudgetItemUi | null>(null);
  const [customName, setCustomName] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isNoFixedValue, setIsNoFixedValue] = useState(false);

  const filteredItems = useMemo(() => {
    const hasSearch = searchTerm.trim().length > 0;
    const hasFilter = priceFilter !== "todos";
    if (!hasSearch && !hasFilter) return [];
    return dedupeItemsByNormalizedName(
      availableItems.filter((item) => {
        const matchSearch = hasSearch ? matchesItemSearch(item.name, searchTerm) : true;
        const matchFilter = matchesPriceFilter(item, priceFilter);
        return matchSearch && matchFilter;
      }),
    );
  }, [searchTerm, priceFilter, availableItems]);

  const selectedItemBehavior = useMemo(() => {
    if (!selectedItem) return null;
    return deriveAddedItemBehavior({
      sourceItem: selectedItem,
      targetParticipationQty,
      manualQuantity: quantity,
      manualUnitPrice: unitPrice,
      manualIsNoFixedValue: isNoFixedValue,
    });
  }, [selectedItem, targetParticipationQty, quantity, unitPrice, isNoFixedValue]);

  const reset = () => {
    setSearchTerm("");
    setPriceFilter("todos");
    setSelectedItem(null);
    setCustomName("");
    setUnitPrice(0);
    setQuantity(1);
    setIsNoFixedValue(false);
    onClose();
  };

  const handleAdd = () => {
    onAdd({
      id: uuidv4(),
      name: selectedItem ? getDisplayItemName(selectedItem.name) : customName,
      unitPrice: isNoFixedValue ? 0 : unitPrice,
      quantity,
      isNoFixedValue,
      originalId: selectedItem?.id,
      originalEventId: selectedItem?.sourceEventId,
      hasSubitems: selectedItem?.hasSubitems,
      selectedVariationId: selectedItem?.variations?.[0]?.id,
      variations: selectedItem?.variations,
      subitems: selectedItem?.subitems,
    });
    reset();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          padding: "20px",
          borderRadius: "8px",
          width: "400px",
          maxWidth: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3 style={{ marginBottom: "12px", fontWeight: "bold" }}>Adicionar Item</h3>

        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
          {(["todos", "pago", "sem_valor"] as PriceFilter[]).map((f) => {
            const labels: Record<PriceFilter, string> = {
              todos: "Todos",
              pago: "Com valor",
              sem_valor: "Sem valor",
            };
            const isActive = priceFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => { setPriceFilter(f); setSelectedItem(null); }}
                style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  border: `1px solid ${isActive ? "var(--color-primary)" : "var(--color-border)"}`,
                  background: isActive ? "var(--color-primary)" : "transparent",
                  color: isActive ? "#fff" : "var(--color-text-main)",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: isActive ? 600 : 400,
                  transition: "all 0.15s",
                }}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>
            Buscar Item Existente
          </label>
          <div style={{ position: "relative" }}>
            <Input
              placeholder="Digite para buscar..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedItem(null);
              }}
            />
            {!selectedItem && filteredItems.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  maxHeight: "150px",
                  overflowY: "auto",
                  zIndex: 10,
                }}
              >
                {filteredItems.map((item) => (
                  <button
                    key={`${item.sourceEventId || "custom"}-${item.id}`}
                    type="button"
                    onClick={() => {
                      const additional =
                        item.hasAdditional &&
                        Number.isFinite(Number(item.additionalQuantity))
                          ? Math.max(0, Math.floor(Number(item.additionalQuantity)))
                          : 0;
                      const multiplier =
                        item.hasMultiplier &&
                        Number.isFinite(Number(item.multiplierQuantity)) &&
                        Number(item.multiplierQuantity) > 0
                          ? Math.floor(Number(item.multiplierQuantity))
                          : 1;
                      const variationDefaultQty = getVariationDrivenQuantity(
                        item,
                        {},
                        item.defaultQuantity ?? item.fixedQty ?? 1,
                      );
                      const variationDefaultPrice = getVariationDrivenUnitPrice(
                        item,
                        {},
                        item.unitPrice,
                      );
                      const baseManualQty = item.dynamicByStudents
                        ? targetParticipationQty
                        : variationDefaultQty;
                      const behavior = deriveAddedItemBehavior({
                        sourceItem: item,
                        targetParticipationQty,
                        manualQuantity: baseManualQty * multiplier + additional,
                        manualUnitPrice: variationDefaultPrice,
                        manualIsNoFixedValue: Boolean(item.displayValue),
                      });
                      setSelectedItem(item);
                      setSearchTerm(item.name);
                      setUnitPrice(behavior.unitPrice);
                      setQuantity(behavior.quantity);
                      setIsNoFixedValue(behavior.isNoFixedValue);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{getDisplayItemName(item.name)}</div>
                    {item.unitPrice > 0 && !item.displayValue && (
                      <div style={{ fontSize: "11px", color: "var(--color-secondary)", fontWeight: 600 }}>
                        {item.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    )}
                    {item.displayValue && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                        {item.displayValue}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!selectedItem && (
          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>
              Nome do Item (customizado)
            </label>
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "15px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>Quantidade</label>
            <Input
              type="number"
              min="1"
              value={quantity}
              disabled={Boolean(selectedItem && !selectedItemBehavior?.quantityEditable)}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>Valor Unitário</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              disabled={Boolean(
                isNoFixedValue ||
                (selectedItem && !selectedItemBehavior?.priceEditable),
              )}
              onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px", fontSize: "14px" }}>
          <input
            type="checkbox"
            checked={isNoFixedValue}
            disabled={Boolean(selectedItem)}
            onChange={(e) => setIsNoFixedValue(e.target.checked)}
          />
          Item sem valor fixo (incluso/cortesia)
        </label>

        {selectedItem && selectedItemBehavior && (
          <div style={{ marginBottom: "18px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            {selectedItemBehavior.quantityEditable
              ? "Quantidade editável conforme a regra do item."
              : "Quantidade bloqueada conforme a regra do item."}
            {" "}
            {selectedItemBehavior.priceEditable
              ? "Valor editável conforme a regra do item."
              : selectedItemBehavior.isNoFixedValue
                ? "Valor definido como incluso/cortesia."
                : "Valor bloqueado conforme a regra do item."}
            {selectedItemBehavior.dynamicByStudents ? " Quantidade dinâmica conforme formandos." : ""}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
          <Button variant="outline" onClick={reset}>
            Cancelar
          </Button>
          <div style={{ display: "flex", gap: "8px" }}>
            {selectedItem && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedItem(null);
                  setSearchTerm("");
                }}
                title="Limpar item selecionado"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <Button
              onClick={handleAdd}
              disabled={!selectedItem && !customName.trim()}
            >
              Adicionar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
