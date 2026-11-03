import { describe, expect, it } from "vitest";
import { mascaraPercentual, mascaraReais, textoDoValor } from "./DiscountInputField";

describe("mascara de valor fixo (R$)", () => {
  it("digita da direita para a esquerda, em centavos", () => {
    expect(mascaraReais("1")).toEqual({ texto: "0,01", valor: 0.01 });
    expect(mascaraReais("12")).toEqual({ texto: "0,12", valor: 0.12 });
    expect(mascaraReais("12000")).toEqual({ texto: "120,00", valor: 120 });
    expect(mascaraReais("420000")).toEqual({ texto: "4.200,00", valor: 4200 });
  });

  it("campo vazio e zero, nao um '0' preso na tela", () => {
    expect(mascaraReais("")).toEqual({ texto: "", valor: 0 });
    expect(mascaraReais("abc")).toEqual({ texto: "", valor: 0 });
  });

  it("o proximo digito substitui o zero em vez de se somar a ele", () => {
    // Estado tipico: campo mostrando "0,01" e o usuario digita outro numero.
    expect(mascaraReais("0,012")).toEqual({ texto: "0,12", valor: 0.12 });
    expect(mascaraReais("0,125")).toEqual({ texto: "1,25", valor: 1.25 });
  });

  it("ignora o que nao e digito e limita o tamanho", () => {
    expect(mascaraReais("R$ 1.200,00")).toEqual({ texto: "1.200,00", valor: 1200 });
    expect(mascaraReais("9".repeat(20)).texto.length).toBeLessThanOrEqual(18);
  });
});

describe("mascara de percentual", () => {
  it("aceita inteiro e decimal", () => {
    expect(mascaraPercentual("10")).toEqual({ texto: "10", valor: 10 });
    expect(mascaraPercentual("7,5")).toEqual({ texto: "7,5", valor: 7.5 });
  });

  it("mantem a virgula na tela enquanto se digita", () => {
    // Sem isto, "7," voltaria a "7" e nao daria para escrever "7,5".
    expect(mascaraPercentual("7,")).toEqual({ texto: "7,", valor: 7 });
  });

  it("ponto vira virgula e so sobra um separador", () => {
    expect(mascaraPercentual("7.5")).toEqual({ texto: "7,5", valor: 7.5 });
    expect(mascaraPercentual("7,5,2")).toEqual({ texto: "7,52", valor: 7.52 });
  });

  it("corta a terceira casa decimal", () => {
    expect(mascaraPercentual("7,5555")).toEqual({ texto: "7,55", valor: 7.55 });
  });

  it("campo vazio e zero", () => {
    expect(mascaraPercentual("")).toEqual({ texto: "", valor: 0 });
  });
});

describe("valor que vem de fora", () => {
  it("zero deixa o campo vazio", () => {
    expect(textoDoValor(0, "FIXED")).toBe("");
    expect(textoDoValor(0, "PERCENT")).toBe("");
  });

  it("desconto salvo aparece formatado na unidade certa", () => {
    expect(textoDoValor(4200, "FIXED")).toBe("4.200,00");
    expect(textoDoValor(7.5, "PERCENT")).toBe("7,5");
  });
});
