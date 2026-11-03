import { Input } from "../Input/Input";

// Input de moeda BRL com máscara por centavos: cada dígito digitado entra pela
// direita (ex.: "4","3","3" → R$ 4,33). Ignora letras/símbolos. Sempre formatado.
type CurrencyInputProps = {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  className?: string;
  label?: string;
  error?: string;
  placeholder?: string;
  readOnly?: boolean;
  // Cresce com o conteúdo (para a direita) até um limite, em vez de largura fixa.
  autoGrow?: boolean;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

export function CurrencyInput({
  value,
  onChange,
  onBlur,
  className,
  label,
  error,
  placeholder,
  readOnly,
  autoGrow,
}: CurrencyInputProps) {
  const display = formatBRL(value);

  if (readOnly) {
    return (
      <span style={{ fontSize: "14px", color: "var(--color-text-main)" }}>
        {display}
      </span>
    );
  }

  // Largura acompanha o texto (+ folga p/ padding), com teto p/ não desorganizar
  // as colunas. Cresce para a direita conforme digita.
  const growStyle = autoGrow
    ? { width: `${Math.min(Math.max(display.length + 3, 10), 20)}ch`, maxWidth: "100%" }
    : undefined;

  return (
    <Input
      type="text"
      inputMode="numeric"
      label={label}
      error={error}
      placeholder={placeholder ?? "R$ 0,00"}
      className={className}
      style={growStyle}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange((parseInt(digits || "0", 10) || 0) / 100);
      }}
      onBlur={onBlur}
    />
  );
}
