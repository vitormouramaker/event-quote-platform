import type { CSSProperties } from "react";
import type { Budget } from "../../../store/budgetStore";
import { DetailedCustomizationsPanel, ApprovedItemDiscountsRow } from "./steps/SummaryStep";
import type { SummaryCustomItems, SummaryFormValues } from "./steps/SummaryStep.types";
import { calculateSummaryStepEventTotals } from "../domain/eventCalculations";
import { getParticipationQuantity } from "../data/runtimeBudgetRules";
import {
  getPresentationItemQuantity,
  getPresentationItemUnitPrice,
} from "../domain/budgetPresentationRules";
import {
  buildApprovedItemDiscountDetails,
  buildApprovedItemRequestsFromDiscountMap,
} from "../domain/itemDiscountDetails";
import {
  formatAppliedDiscount,
  formatItemDiscount,
  resolveGlobalDiscountValue,
} from "../domain/discountInput";
import {
  getAuditoriumDisplayName,
  getResolvedAuditoriumSlug,
  getMusicAttractionLabel,
  getResolvedAuditoriumPrice,
  isAuditoriumItemByIdOrName,
  isMusicAttractionItem,
} from "../domain/budgetUiRules";
import { EVENT_TYPES, type EventType } from "../data/mockData";
import type { BudgetCatalogEvent } from "../data/budgetCatalog";

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "Pendente", bg: "#fef9c3", color: "#854d0e" },
  SENT_FOR_APPROVAL: { label: "Enviado p/ Aprovação", bg: "#dbeafe", color: "#1e40af" },
  APPROVED: { label: "Aprovado", bg: "#dcfce7", color: "#166534" },
  CANCELLED: { label: "Cancelado", bg: "#fee2e2", color: "#991b1b" },
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

function getPreviewItemLabel(
  itemId: string,
  itemName: string,
  itemsData: Record<string, unknown>,
) {
  const selectedVariationLabel = itemsData[`${itemId}_variation_label`];
  const cleanedItemName = itemName.replace(/\s*\([^)]*\)\s*$/, "");

  if (isAuditoriumItemByIdOrName(itemId, itemName)) {
    return getAuditoriumDisplayName(
      getResolvedAuditoriumPrice(itemId, itemsData),
      getResolvedAuditoriumSlug(itemId, itemsData),
    );
  }

  if (typeof selectedVariationLabel === "string" && selectedVariationLabel.trim()) {
    if (isMusicAttractionItem(itemId)) {
      return `Atração Musical (${selectedVariationLabel.trim()})`;
    }
    return `${cleanedItemName} (${selectedVariationLabel.trim()})`;
  }

  if (isMusicAttractionItem(itemId)) {
    return getMusicAttractionLabel(String(itemsData.atracao_musical_type || "dj"));
  }

  return cleanedItemName;
}

export function BudgetPreviewContent({
  budget,
  budgetEvents = EVENT_TYPES,
}: {
  budget: Budget;
  budgetEvents?: EventType[] | BudgetCatalogEvent[];
}) {
  const catalog = budgetEvents as EventType[];
  const formValues = (budget.data ?? {}) as SummaryFormValues;
  const selectedEventIds: string[] = Array.isArray(formValues.selectedEvents)
    ? (formValues.selectedEvents as string[])
    : [];
  const approvedItemDiscounts = budget.approvedItemDiscounts ?? {};
  const approvedItemDiscountAmounts = budget.approvedItemDiscountAmounts ?? {};
  const customItems = (formValues.customItems ?? {}) as SummaryCustomItems;
  const resolvedItemRequests = buildApprovedItemRequestsFromDiscountMap(
    formValues,
    catalog,
    approvedItemDiscounts,
    approvedItemDiscountAmounts,
  );
  const approvedItemDiscountDetails = buildApprovedItemDiscountDetails(
    formValues,
    catalog,
    resolvedItemRequests,
  );

  const itemRequestsMap: Record<string, typeof resolvedItemRequests> = {
    [budget.id]: resolvedItemRequests,
  };
  const calculateEventTotal = (event: EventType) =>
    calculateSummaryStepEventTotals(event, formValues, itemRequestsMap);

  let subtotal = 0;
  let totalDiscounted = 0;
  selectedEventIds.forEach((eventId) => {
    if (eventId === "culto_cortesia" || eventId === "evento_100_dias") return;
    const event = catalog.find((e) => e.id === eventId);
    if (!event) return;
    const result = calculateEventTotal(event);
    subtotal += result.total;
    totalDiscounted += result.discountedTotal;
  });

  const storedDeficit = budget.deficitValue ?? 0;
  const discountPercent = budget.discountPercent ?? 0;
  const discountValue = resolveGlobalDiscountValue(totalDiscounted, budget);
  const totalFinal = totalDiscounted - discountValue;

  const infoRows: [string, string | null | undefined][] = [
    ["Instituição", budget.instituicao],
    ["Curso", budget.curso],
    ["Comissão", budget.comissao],
    ["Telefone", budget.telefone],
    ["Controle", budget.controle],
    ["Criado por", budget.createdByName || budget.createdBy],
    ["Código", budget.budgetCode],
  ];
  const statusMeta = STATUS_LABELS[budget.status] ?? STATUS_LABELS.PENDING;

  const thStyle: CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    fontWeight: 600,
    fontSize: "0.75rem",
    color: "var(--color-text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "2px solid var(--color-border)",
    whiteSpace: "nowrap",
  };
  const tdStyle: CSSProperties = {
    padding: "8px 10px",
    fontSize: "0.875rem",
    color: "var(--color-text-main)",
    verticalAlign: "top",
  };
  const tdRight: CSSProperties = { ...tdStyle, textAlign: "right" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "0.75rem",
          padding: "1rem",
          backgroundColor: "var(--color-bg-tertiary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
        }}
      >
        {infoRows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <p style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </p>
            <p style={{ fontSize: "0.9rem", color: "var(--color-text-main)", fontWeight: 500, marginTop: "2px", overflowWrap: "anywhere" }}>
              {value}
            </p>
          </div>
        ))}
        <div>
          <p style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Status
          </p>
          <span
            style={{
              display: "inline-block",
              marginTop: "4px",
              padding: "2px 10px",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              backgroundColor: statusMeta.bg,
              color: statusMeta.color,
            }}
          >
            {statusMeta.label}
          </span>
        </div>
      </div>

      {budget.observation && (
        <div
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "var(--radius-md)",
          }}
        >
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#92400e", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Observação
          </p>
          <p style={{ fontSize: "0.9rem", color: "#78350f" }}>{budget.observation}</p>
        </div>
      )}

      {selectedEventIds.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>
          Nenhum evento selecionado.
        </p>
      ) : (
        selectedEventIds.map((eventId) => {
          const event = catalog.find((e) => e.id === eventId);
          if (!event) return null;

          const participation = getParticipationQuantity(
            formValues as Record<string, unknown>,
            eventId,
            0,
          );
          const removedIds = customItems[eventId]?.removedIds ?? [];
          const addedItems = customItems[eventId]?.added ?? [];
          const itemsData =
            (formValues.items as Record<string, Record<string, unknown>> | undefined)?.[eventId] ?? {};
          const { total: evtTotal, discountedTotal: evtDiscounted } = calculateEventTotal(event);
          const isDeficit = eventId === "culto_cortesia";
          const visibleItems = event.items.filter((item) => !item.isHeader && !removedIds.includes(item.id));

          return (
            <div key={eventId} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--color-bg-tertiary)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text-main)" }}>
                    {event.title}
                  </span>
                  {isDeficit && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                        fontWeight: 600,
                      }}
                    >
                      Déficit
                    </span>
                  )}
                </div>
                {participation > 0 && (
                  <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                    {participation} formando{participation !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                      <th style={{ ...thStyle, width: "40%" }}>Item</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Qtd</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Valor Unit.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Desconto</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item, idx) => {
                      const effectiveQty = getPresentationItemQuantity(eventId, item, itemsData, participation);
                      const effectivePrice = getPresentationItemUnitPrice(item, itemsData);
                      const discountKey = `${eventId}-${item.id}`;
                      const itemDiscountPct = approvedItemDiscounts[discountKey] ?? 0;
                      const itemDiscountAmount = approvedItemDiscountAmounts[discountKey] ?? 0;
                      const isIncluded = Boolean(item.displayValue);
                      const itemTotal = isIncluded ? 0 : effectiveQty * effectivePrice;
                      const itemTotalDiscounted = isIncluded ? 0 : itemTotal * (1 - itemDiscountPct / 100);
                      const rowBg = idx % 2 === 0 ? "transparent" : "var(--color-bg-secondary)";
                      const displayName = getPreviewItemLabel(item.id, item.name, itemsData);

                      return (
                        <tr key={item.id} style={{ backgroundColor: rowBg, borderBottom: "1px solid var(--color-border)" }}>
                          <td style={tdStyle}>{displayName}</td>
                          <td style={tdRight}>{isIncluded ? "-" : effectiveQty > 0 ? effectiveQty : "-"}</td>
                          <td style={tdRight}>
                            {isIncluded ? (
                              <span style={{ fontSize: "0.75rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>
                                {item.displayValue}
                              </span>
                            ) : effectivePrice > 0 ? (
                              formatCurrency(effectivePrice)
                            ) : (
                              "-"
                            )}
                          </td>
                          <td style={{ ...tdRight, color: itemDiscountPct > 0 ? "#16a34a" : "var(--color-text-secondary)" }}>
                            {itemDiscountPct > 0
                              ? formatItemDiscount({
                                  requestedPercentage: itemDiscountPct,
                                  discountMode: itemDiscountAmount ? "FIXED" : "PERCENT",
                                  requestedAmount: itemDiscountAmount,
                                })
                              : "-"}
                          </td>
                          <td style={{ ...tdRight, fontWeight: 500 }}>
                            {isIncluded ? (
                              <span style={{ fontSize: "0.75rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>
                                Incluso
                              </span>
                            ) : itemTotal > 0 ? itemDiscountPct > 0 ? (
                              <span>
                                <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>
                                  {formatCurrency(itemTotal)}
                                </span>
                                <span style={{ color: "#16a34a" }}>{formatCurrency(itemTotalDiscounted)}</span>
                              </span>
                            ) : (
                              formatCurrency(itemTotal)
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {addedItems.map((addedItem, idx) => {
                      const qty = Number(addedItem.quantity) || 0;
                      const price = Number(addedItem.unitPrice) || 0;
                      const total = addedItem.isNoFixedValue ? 0 : qty * price;
                      const addedItemId = addedItem.id || `added_${idx}`;
                      const itemDiscountPct = approvedItemDiscounts[`${eventId}-${addedItemId}`] ?? 0;
                      const itemDiscountAmount =
                        approvedItemDiscountAmounts[`${eventId}-${addedItemId}`] ?? 0;
                      const totalDiscounted = addedItem.isNoFixedValue
                        ? 0
                        : total * (1 - itemDiscountPct / 100);
                      const selectedVariationLabel = addedItem.variations?.find(
                        (variation) => variation.id === addedItem.selectedVariationId,
                      )?.name;
                      const rowBg = (visibleItems.length + idx) % 2 === 0 ? "transparent" : "var(--color-bg-secondary)";

                      return (
                        <tr key={`added-${idx}`} style={{ backgroundColor: rowBg, borderBottom: "1px solid var(--color-border)" }}>
                          <td style={tdStyle}>
                            <span style={{ marginRight: "6px", fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>
                              +
                            </span>
                            {selectedVariationLabel
                              ? `${addedItem.name || "Item personalizado"} (${selectedVariationLabel})`
                              : addedItem.name || "Item personalizado"}
                          </td>
                          <td style={tdRight}>{addedItem.isNoFixedValue ? "-" : qty > 0 ? qty : "-"}</td>
                          <td style={tdRight}>
                            {addedItem.isNoFixedValue ? (
                              <span style={{ fontSize: "0.75rem", color: "#16a34a" }}>Incluso</span>
                            ) : price > 0 ? (
                              formatCurrency(price)
                            ) : (
                              "-"
                            )}
                          </td>
                          <td style={{ ...tdRight, color: itemDiscountPct > 0 ? "#16a34a" : "var(--color-text-secondary)" }}>
                            {itemDiscountPct > 0
                              ? formatItemDiscount({
                                  requestedPercentage: itemDiscountPct,
                                  discountMode: itemDiscountAmount ? "FIXED" : "PERCENT",
                                  requestedAmount: itemDiscountAmount,
                                })
                              : "-"}
                          </td>
                          <td style={{ ...tdRight, fontWeight: 500 }}>
                            {addedItem.isNoFixedValue ? (
                              <span style={{ fontSize: "0.75rem", color: "#16a34a" }}>Incluso</span>
                            ) : total > 0 ? itemDiscountPct > 0 ? (
                              <span>
                                <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>
                                  {formatCurrency(total)}
                                </span>
                                <span style={{ color: "#16a34a" }}>{formatCurrency(totalDiscounted)}</span>
                              </span>
                            ) : (
                              formatCurrency(total)
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)" }}>
                      <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, textAlign: "right", color: "var(--color-text-secondary)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                        {isDeficit ? "Custo Cortesia" : "Total do Evento"}
                      </td>
                      <td style={{ ...tdRight, fontWeight: 700 }}>
                        {isDeficit ? (
                          <span style={{ color: "#d9534f" }}>{formatCurrency(storedDeficit)}</span>
                        ) : evtDiscounted < evtTotal ? (
                          <span>
                            <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>
                              {formatCurrency(evtTotal)}
                            </span>
                            <span style={{ color: "#16a34a" }}>{formatCurrency(evtDiscounted)}</span>
                          </span>
                        ) : (
                          formatCurrency(evtTotal)
                        )}
                      </td>
                    </tr>
                    {!isDeficit && participation > 0 && (
                      <tr style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                        <td colSpan={4} style={{ ...tdStyle, textAlign: "right", color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
                          Valor por formando
                        </td>
                        <td style={{ ...tdRight, color: "var(--color-primary)", fontWeight: 600 }}>
                          {formatCurrency(evtDiscounted / participation)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })
      )}

      <DetailedCustomizationsPanel customItems={customItems} />

      <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--color-bg-tertiary)", borderBottom: "1px solid var(--color-border)" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text-main)" }}>
            Resumo Financeiro
          </span>
        </div>
        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            <span>Subtotal (Eventos Pagos)</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          <ApprovedItemDiscountsRow details={approvedItemDiscountDetails} />

          {(discountValue > 0 || discountPercent > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "#dc2626" }}>
              <span>Desconto Global Aplicado ({formatAppliedDiscount(budget)})</span>
              <span>- {formatCurrency(discountValue)}</span>
            </div>
          )}

          <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "0.25rem 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text-main)" }}>
            <span>Total Final (Cliente)</span>
            <span>{formatCurrency(totalFinal > 0 ? totalFinal : budget.totalValue ?? 0)}</span>
          </div>

          {storedDeficit > 0 && (
            <>
              <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "0.25rem 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "#d9534f" }}>
                <span>Déficit / Custos Cortesia</span>
                <span>{formatCurrency(storedDeficit)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
