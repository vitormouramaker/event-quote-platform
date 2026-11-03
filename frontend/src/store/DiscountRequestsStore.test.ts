import { describe, expect, it } from "vitest";
import {
  mergeFetchedItemRequests,
  type ItemDiscountRequest,
} from "./DiscountRequestsStore";

function itemRequest(overrides: Partial<ItemDiscountRequest> = {}): ItemDiscountRequest {
  return {
    id: "temp-1",
    budgetId: "budget-1",
    clientName: "Cliente",
    eventId: "event-1",
    itemId: "item-1",
    itemName: "Item 1",
    originalUnitPrice: 100,
    requestedPercentage: 10,
    requestedBy: "Usuario",
    requestedAt: "2026-05-20T00:00:00.000Z",
    reason: "Negociacao",
    status: "PENDING",
    ...overrides,
  };
}

describe("mergeFetchedItemRequests", () => {
  it("preserva pendencia otimista local quando backend ainda nao devolveu request", () => {
    const localPending = itemRequest();

    expect(mergeFetchedItemRequests([localPending], [])).toEqual([localPending]);
  });

  it("remove pendencia otimista local quando backend ja devolveu request equivalente", () => {
    const localPending = itemRequest();
    const remotePending = itemRequest({
      id: "11111111-1111-1111-1111-111111111111",
      budgetId: "budget-2",
    });

    expect(mergeFetchedItemRequests([localPending], [remotePending])).toEqual([remotePending]);
  });

  it("mantem requests remotos e conserva apenas pendencias locais ainda nao sincronizadas", () => {
    const localPendingA = itemRequest();
    const localPendingB = itemRequest({
      id: "temp-2",
      itemId: "item-2",
      itemName: "Item 2",
      requestedPercentage: 15,
      reason: "Outro motivo",
    });
    const remotePendingA = itemRequest({
      id: "11111111-1111-1111-1111-111111111111",
      budgetId: "budget-2",
    });
    const remoteApproved = itemRequest({
      id: "22222222-2222-2222-2222-222222222222",
      itemId: "item-3",
      itemName: "Item 3",
      status: "APPROVED",
      requestedPercentage: 20,
      reason: "Aprovado",
    });

    expect(
      mergeFetchedItemRequests([localPendingA, localPendingB], [remotePendingA, remoteApproved]),
    ).toEqual([remotePendingA, remoteApproved, localPendingB]);
  });
});
