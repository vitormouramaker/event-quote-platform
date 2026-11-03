import { describe, expect, it } from "vitest";
import {
  formatAppliedDiscount,
  formatDiscountInput,
  resolveDiscountAmounts,
  resolveDiscountMode,
  resolveGlobalDiscountValue,
  validateDiscountInput,
} from "./discountInput";

describe("desconto em percentual ou em valor fixo", () => {
  it("percentual vira valor sobre a base", () => {
    expect(resolveDiscountAmounts(1000, { mode: "PERCENT", value: 10 })).toEqual({
      percent: 10,
      amount: 100,
    });
  });

  it("valor fixo vira o percentual equivalente, sem arredondar", () => {
    const { percent, amount } = resolveDiscountAmounts(7420, {
      mode: "FIXED",
      value: 500,
    });

    expect(amount).toBe(500);
    // O percentual nao e redondo; arredondar aqui erraria centavos depois.
    expect(percent).toBeCloseTo(6.7385, 4);
    // E o que importa: reconstruir o valor pedido a partir dele da os R$ 500.
    expect(7420 * (percent / 100)).toBeCloseTo(500, 2);
  });

  it("valor fixo sem base nao tem percentual equivalente", () => {
    expect(resolveDiscountAmounts(0, { mode: "FIXED", value: 500 })).toEqual({
      percent: 0,
      amount: 500,
    });
  });

  it("modo desconhecido ou ausente e percentual: orcamento antigo nao muda", () => {
    expect(resolveDiscountMode(undefined)).toBe("PERCENT");
    expect(resolveDiscountMode(null)).toBe("PERCENT");
    expect(resolveDiscountMode("")).toBe("PERCENT");
    expect(resolveDiscountMode("qualquer")).toBe("PERCENT");
    expect(resolveDiscountMode("fixed")).toBe("FIXED");
    expect(resolveDiscountMode("FIXED")).toBe("FIXED");
  });

  describe("desconto geral", () => {
    it("em percentual acompanha a base", () => {
      expect(resolveGlobalDiscountValue(10000, { discountPercent: 10 })).toBe(1000);
      expect(resolveGlobalDiscountValue(20000, { discountPercent: 10 })).toBe(2000);
    });

    it("em valor fixo NAO acompanha a base", () => {
      const fixo = { discountMode: "FIXED", discountAmount: 1000, discountPercent: 10 };

      // O mesmo R$ 1.000 depois de o orcamento mudar de tamanho.
      expect(resolveGlobalDiscountValue(10000, fixo)).toBe(1000);
      expect(resolveGlobalDiscountValue(20000, fixo)).toBe(1000);
    });

    it("valor fixo nao passa do total nem fica negativo", () => {
      expect(
        resolveGlobalDiscountValue(800, { discountMode: "FIXED", discountAmount: 1000 }),
      ).toBe(800);
      expect(
        resolveGlobalDiscountValue(1000, { discountMode: "FIXED", discountAmount: -50 }),
      ).toBe(0);
    });

    it("sem modo salvo segue no percentual", () => {
      expect(
        resolveGlobalDiscountValue(10000, { discountPercent: 5, discountAmount: 999 }),
      ).toBe(500);
    });
  });

  describe("rotulos", () => {
    it("mostra o que foi pedido, na unidade que foi pedida", () => {
      expect(formatDiscountInput({ mode: "PERCENT", value: 10 })).toBe("10%");
      expect(formatDiscountInput({ mode: "PERCENT", value: 7.5 })).toBe("7,5%");
      expect(formatDiscountInput({ mode: "FIXED", value: 1234.56 })).toContain("1.234,56");
    });

    it("do desconto aplicado, le o modo do orcamento", () => {
      expect(formatAppliedDiscount({ discountPercent: 10 })).toBe("10%");
      expect(
        formatAppliedDiscount({
          discountMode: "FIXED",
          discountAmount: 1000,
          discountPercent: 6.7385,
        }),
      ).toContain("1.000,00");
    });
  });

  describe("validacao", () => {
    it("recusa zero e negativo nos dois modos", () => {
      expect(validateDiscountInput({ mode: "PERCENT", value: 0 }, 1000)).toBeTruthy();
      expect(validateDiscountInput({ mode: "FIXED", value: -1 }, 1000)).toBeTruthy();
    });

    it("recusa percentual acima de 100", () => {
      expect(validateDiscountInput({ mode: "PERCENT", value: 101 }, 1000)).toBe(
        "Percentual inválido.",
      );
      expect(validateDiscountInput({ mode: "PERCENT", value: 100 }, 1000)).toBeNull();
    });

    it("recusa valor fixo acima da base", () => {
      expect(validateDiscountInput({ mode: "FIXED", value: 1001 }, 1000)).toContain(
        "1.000,00",
      );
      expect(validateDiscountInput({ mode: "FIXED", value: 1000 }, 1000)).toBeNull();
    });

    it("recusa valor fixo sem base", () => {
      expect(validateDiscountInput({ mode: "FIXED", value: 10 }, 0)).toContain(
        "Sem valor para descontar",
      );
    });
  });
});
