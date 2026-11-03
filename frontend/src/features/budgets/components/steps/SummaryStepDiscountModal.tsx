import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Paperclip } from "lucide-react";
import { Button } from "../../../../components/Button/Button";
import { formatCurrency } from "./SummaryStepMoney";
import { DiscountInputField } from "../DiscountInputField";
import {
  DEFAULT_DISCOUNT_MODE,
  validateDiscountInput,
  type DiscountMode,
} from "../../domain/discountInput";

type SummaryStepDiscountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** `value` é percentual quando o modo é PERCENT e reais quando é FIXED. */
  onConfirm: (
    value: number,
    reason: string,
    attachment: File | null | undefined,
    mode: DiscountMode,
  ) => void;
  onRemove?: () => void;
  totalValue: number;
  isAdmin?: boolean;
  isEditing?: boolean;
  initialPercent?: number;
  initialReason?: string;
  initialMode?: DiscountMode;
  /** Valor em reais já pedido, quando o pedido salvo é de valor fixo. */
  initialAmount?: number;
};

export function SummaryStepDiscountModal({
  isOpen,
  onClose,
  onConfirm,
  onRemove,
  totalValue,
  isAdmin,
  isEditing,
  initialPercent = 0,
  initialReason = "",
  initialMode = DEFAULT_DISCOUNT_MODE,
  initialAmount = 0,
}: SummaryStepDiscountModalProps) {
  const [mode, setMode] = useState<DiscountMode>(DEFAULT_DISCOUNT_MODE);
  const [value, setValue] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setValue(initialMode === "FIXED" ? initialAmount : initialPercent);
      setReason(initialReason || "");
      setAttachment(null);
    }
  }, [isOpen, initialPercent, initialReason, initialMode, initialAmount]);

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo do desconto.");
      return;
    }
    const erro = validateDiscountInput({ mode, value }, totalValue);
    if (erro) {
      toast.error(erro);
      return;
    }
    onConfirm(value, reason, attachment, mode);
  };

  // Trocar de unidade zera o campo: 10 em "%" e 10 em "R$" são pedidos
  // completamente diferentes, e manter o número confundiria.
  const trocarModo = (novo: DiscountMode) => {
    if (novo === mode) return;
    setMode(novo);
    setValue(0);
  };

  if (!isOpen) return null;

  const title = isEditing
    ? isAdmin
      ? "Editar Desconto Geral"
      : "Editar Solicitação"
    : isAdmin
      ? "Aplicar Desconto Geral"
      : "Solicitar Desconto Geral";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          padding: "24px",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "450px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "var(--color-text-main)",
              flex: 1,
            }}
          >
            {title}
          </h3>
          {isEditing && onRemove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Tem certeza que deseja remover este desconto?")) {
                  onRemove();
                }
              }}
              style={{ color: "#ef4444" }}
              title="Remover Desconto"
            >
              <Trash2 size={18} />
            </Button>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-secondary)",
              marginBottom: "4px",
            }}
          >
            Valor Atual (com descontos de itens)
          </p>
          <p
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              color: "var(--color-text-main)",
            }}
          >
            {formatCurrency(totalValue)}
          </p>
        </div>

        <DiscountInputField
          mode={mode}
          onModeChange={trocarModo}
          value={value}
          onValueChange={setValue}
          base={totalValue}
          finalLabel="Final Previsto"
        />

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              marginBottom: "4px",
              color: "var(--color-text-main)",
            }}
          >
            Motivo ({isAdmin ? "Opcional" : "Obrigatório"})
          </label>
          <textarea
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              minHeight: "80px",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              fontSize: "14px",
            }}
            placeholder="Justifique a solicitação global..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "500", marginBottom: "4px", color: "var(--color-text-main)" }}>
            Anexo (Opcional)
          </label>
          <label style={{
            display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
            padding: "8px 12px", border: "1px dashed var(--color-border)",
            borderRadius: "6px", fontSize: "13px", color: "var(--color-text-secondary)",
          }}>
            <Paperclip size={14} />
            {attachment ? attachment.name : "Clique para selecionar um documento"}
            <input type="file" style={{ display: "none" }} onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
          </label>
          {attachment && (
            <button type="button" onClick={() => setAttachment(null)}
              style={{ marginTop: "4px", fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Remover anexo
            </button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            {isEditing ? "Salvar Alterações" : isAdmin ? "Aplicar" : "Solicitar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
