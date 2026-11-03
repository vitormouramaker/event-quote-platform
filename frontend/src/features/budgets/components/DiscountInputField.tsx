import { useEffect, useRef, useState } from "react";
import { Input } from "../../../components/Input/Input";
import {
  resolveDiscountAmounts,
  type DiscountMode,
} from "../domain/discountInput";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const decimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Máscara de moeda: o que o usuário digita são centavos, da direita para a
 * esquerda. "12000" vira "120,00". O limite de 12 dígitos evita que um teclado
 * preso estoure a precisão do número.
 */
export function mascaraReais(digitado: string) {
  const digitos = digitado.replace(/\D/g, "").slice(0, 12).replace(/^0+(?=\d)/, "");
  if (!digitos) return { texto: "", valor: 0 };
  const valor = Number(digitos) / 100;
  return { texto: decimal.format(valor), valor };
}

/**
 * Percentual aceita vírgula ou ponto como separador, mas só um. Não formata
 * enquanto se digita: "7," precisa continuar na tela para o usuário terminar
 * de escrever "7,5".
 */
/** Como um valor vindo de fora (um desconto já salvo) aparece no campo. */
export function textoDoValor(valor: number, mode: DiscountMode) {
  // Zero é campo vazio, nunca um "0" para o usuário apagar antes de digitar.
  if (!(valor > 0)) return "";
  return mode === "FIXED" ? decimal.format(valor) : String(valor).replace(".", ",");
}

export function mascaraPercentual(digitado: string) {
  const limpo = digitado.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [inteiro, ...resto] = limpo.split(",");
  const texto = resto.length > 0 ? `${inteiro},${resto.join("").slice(0, 2)}` : inteiro;
  return { texto, valor: Number(texto.replace(",", ".")) || 0 };
}

type Props = {
  mode: DiscountMode;
  onModeChange: (mode: DiscountMode) => void;
  value: number;
  onValueChange: (value: number) => void;
  /** Valor sobre o qual o desconto incide, para a prévia. */
  base: number;
  /** Rótulo do valor final: "Final Previsto" no geral, "Novo Valor" no item. */
  finalLabel?: string;
};

const tabBase: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
};

/**
 * Campo de desconto em percentual ou em valor fixo, com a prévia do desconto e
 * do valor final. Os dois modais de desconto (geral e por item) pediam a mesma
 * coisa de formas diferentes; aqui a regra mora num lugar só.
 */
export function DiscountInputField({
  mode,
  onModeChange,
  value,
  onValueChange,
  base,
  finalLabel = "Final Previsto",
}: Props) {
  const { amount } = resolveDiscountAmounts(base, { mode, value });
  // Um desconto fixo maior que a base deixaria o final negativo na prévia; o
  // aviso de validação aparece no envio, aqui só não mostramos valor negativo.
  const discountValue = Math.min(amount, Math.max(base, 0));
  const finalValue = Math.max(base - discountValue, 0);

  // O texto é o que está na tela; o número é o que sai daqui. Os dois andam
  // juntos, mas o texto manda enquanto se digita: zero vira campo VAZIO, e não
  // um "0" que o usuário precisa apagar antes de escrever o valor.
  const [texto, setTexto] = useState(() => textoDoValor(value, mode));
  const ultimoValor = useRef(value);

  useEffect(() => {
    // Só reescreve o texto quando o valor muda por fora (abrir o modal com um
    // desconto salvo, trocar de unidade). Reescrever a cada tecla atrapalharia
    // quem está no meio de "7,5".
    if (value === ultimoValor.current) return;
    ultimoValor.current = value;
    setTexto(textoDoValor(value, mode));
  }, [value, mode]);

  const digitar = (digitado: string) => {
    const { texto: proximoTexto, valor } = mode === "FIXED"
      ? mascaraReais(digitado)
      : mascaraPercentual(digitado);
    setTexto(proximoTexto);
    ultimoValor.current = valor;
    onValueChange(valor);
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        style={{
          display: "block",
          fontSize: "14px",
          fontWeight: 500,
          marginBottom: "6px",
          color: "var(--color-text-main)",
        }}
      >
        Desconto
      </label>

      <div
        style={{
          display: "inline-flex",
          borderRadius: "8px",
          overflow: "hidden",
          marginBottom: "10px",
        }}
        role="group"
        aria-label="Tipo de desconto"
      >
        <button
          type="button"
          aria-pressed={mode === "PERCENT"}
          onClick={() => onModeChange("PERCENT")}
          style={{
            ...tabBase,
            borderRadius: "8px 0 0 8px",
            ...(mode === "PERCENT"
              ? {
                  background: "var(--color-primary)",
                  borderColor: "var(--color-primary)",
                  color: "#fff",
                }
              : {}),
          }}
        >
          Percentual (%)
        </button>
        <button
          type="button"
          aria-pressed={mode === "FIXED"}
          onClick={() => onModeChange("FIXED")}
          style={{
            ...tabBase,
            borderRadius: "0 8px 8px 0",
            borderLeft: "none",
            ...(mode === "FIXED"
              ? {
                  background: "var(--color-primary)",
                  borderColor: "var(--color-primary)",
                  color: "#fff",
                }
              : {}),
          }}
        >
          Valor fixo (R$)
        </button>
      </div>

      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        {/* `text` e não `number`: a máscara precisa dos pontos e da vírgula, que
            um input numérico recusaria. */}
        <Input
          type="text"
          inputMode="decimal"
          leftIcon={mode === "FIXED" ? "R$" : "%"}
          value={texto}
          onChange={(e) => digitar(e.target.value)}
          placeholder={mode === "PERCENT" ? "10" : "1.000,00"}
          aria-label={mode === "PERCENT" ? "Percentual de desconto" : "Valor do desconto em reais"}
          style={{ width: "150px" }}
        />
        {/* Rótulo numa linha, valor na outra: com os dois na mesma linha, um
            valor grande quebrava e deixava o "-" sozinho em cima do número. */}
        <div style={{ display: "flex", gap: "24px", fontSize: "14px" }}>
          <div>
            <div style={{ color: "var(--color-text-secondary)" }}>Desconto</div>
            <div
              style={{ color: "#ef4444", fontWeight: 600, whiteSpace: "nowrap" }}
            >
              - {currency.format(discountValue)}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--color-text-secondary)" }}>{finalLabel}</div>
            <div
              style={{ color: "#16a34a", fontWeight: "bold", whiteSpace: "nowrap" }}
            >
              {currency.format(finalValue)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
