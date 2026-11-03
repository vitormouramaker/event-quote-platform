// Datas de evento são armazenadas como "YYYY-MM-DD" (date-only, vindas de <input type="date">).
// new Date("YYYY-MM-DD") interpreta a string como meia-noite UTC, o que exibe o DIA ANTERIOR
// em fusos negativos (Brasil = UTC-3). Anexar "T00:00:00" força meia-noite LOCAL, preservando
// o dia. Strings que já têm hora (ISO com "T") são parseadas direto.
export function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(isDateOnly ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Formata uma data (date-only ou ISO) no padrão pt-BR (dd/mm/aaaa) sem o desvio de fuso.
export function formatDateBR(value: unknown, fallback = ""): string {
  const parsed = parseLocalDate(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : fallback;
}
