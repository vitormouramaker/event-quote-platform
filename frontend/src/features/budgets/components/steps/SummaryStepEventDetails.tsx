import type { EventType } from "../../data/mockData";
import type { BudgetCatalogEvent } from "../../data/budgetCatalog";
import { getParticipationQuantity } from "../../data/runtimeBudgetRules";
import summaryStyles from "./SummaryStep.module.css";
import { formatCurrency } from "./SummaryStepMoney";
import type { EventTotalsResult, SummaryFormValues } from "./SummaryStep.types";

type EventDetailsTableProps = {
  formValues: SummaryFormValues;
  eventCatalog: BudgetCatalogEvent[];
  calculateEventTotal: (event: EventType) => EventTotalsResult;
};

export function EventDetailsTable({
  formValues,
  eventCatalog,
  calculateEventTotal,
}: EventDetailsTableProps) {
  return (
    <div
      className={summaryStyles.row}
      style={{
        flexDirection: "column",
        gap: "10px",
        alignItems: "flex-start",
        marginBottom: "20px",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          fontSize: "14px",
          color: "var(--color-text-main)",
        }}
      >
        Detalhamento por Evento
      </span>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "8px 4px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Evento
            </th>
            <th style={{ textAlign: "center", padding: "8px 4px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Formandos
            </th>
            <th style={{ textAlign: "right", padding: "8px 4px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Valor Unit.
            </th>
            <th style={{ textAlign: "right", padding: "8px 4px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {(formValues.selectedEvents || []).map((eventId: string) => {
            const event = eventCatalog.find((e) => e.id === eventId);
            if (!event) return null;

            const customItems = formValues.customItems || {};
            const removedIds = customItems[eventId]?.removedIds || [];
            const addedItems = customItems[eventId]?.added || [];
            const participants = getParticipationQuantity(
              formValues as Record<string, unknown>,
              event.id,
              0,
            );
            const { total, discountedTotal } = calculateEventTotal(event);
            const unitValue = participants > 0 ? total / participants : 0;
            const discountedUnitValue = participants > 0 ? discountedTotal / participants : 0;
            const hasItemDiscount = discountedTotal < total;

            return (
              <tr key={eventId} style={{ borderBottom: "1px dashed var(--color-border)" }}>
                <td style={{ padding: "8px 4px" }}>
                  {event.title}
                  {(addedItems.length > 0 || removedIds.length > 0) && (
                    <div style={{ fontSize: "11px", color: "#d97706", marginTop: "2px" }}>
                      (Personalizado: +{addedItems.length} / -{removedIds.length} itens)
                    </div>
                  )}
                  {hasItemDiscount && (
                    <div style={{ fontSize: "11px", color: "#16a34a", marginTop: "2px", fontWeight: 600 }}>
                      com descontos aplicados
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "center", padding: "8px 4px" }}>
                  {participants > 0 ? participants : "-"}
                </td>
                <td style={{ textAlign: "right", padding: "8px 4px" }}>
                  {participants > 0 ? (
                    hasItemDiscount ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          Original
                        </span>
                        <span style={{ fontSize: "12px", textDecoration: "line-through", color: "#9ca3af" }}>
                          {formatCurrency(unitValue)}
                        </span>
                        <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 700 }}>
                          Com desconto
                        </span>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>
                          {formatCurrency(discountedUnitValue)}
                        </span>
                      </div>
                    ) : (
                      formatCurrency(unitValue)
                    )
                  ) : "-"}
                </td>
                <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: 500 }}>
                  {hasItemDiscount ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                        Original
                      </span>
                      <span style={{ fontSize: "12px", textDecoration: "line-through", color: "#9ca3af" }}>
                        {formatCurrency(total)}
                      </span>
                      <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 700 }}>
                        Com desconto
                      </span>
                      <span style={{ color: "#16a34a", fontWeight: 700 }}>
                        {formatCurrency(discountedTotal)}
                      </span>
                    </div>
                  ) : (
                    formatCurrency(total)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
