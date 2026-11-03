import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Posição calculada a partir do botão e renderizada em portal com position:fixed
  // — evita clipping/estouro por qualquer ancestral com overflow/transform.
  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const half = 150; // metade aprox. da largura máxima do tooltip
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, half + 8),
        window.innerWidth - half - 8,
      );
      setPos({ top: rect.bottom + 8, left });
    }
    setOpen(true);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.preventDefault()}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "999px",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-secondary)",
          fontSize: "12px",
          lineHeight: 1,
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
              width: "max-content",
              maxWidth: "280px",
              padding: "9px 12px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
              fontSize: "12px",
              lineHeight: 1.45,
              whiteSpace: "normal",
              wordBreak: "break-word",
              boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
              zIndex: 9999,
              pointerEvents: "none",
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
