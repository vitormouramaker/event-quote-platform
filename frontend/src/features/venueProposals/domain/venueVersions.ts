/**
 * Versões de uma proposta de locação.
 *
 * Editar uma proposta que já saiu do rascunho não reescreve o documento: cria
 * a versão seguinte e deixa a anterior intacta, porque ela já foi enviada ao
 * cliente. As versões compartilham o `family_code`.
 */

export type VenueVersionLike = {
  id: string;
  proposal_code: string;
  family_code?: string | null;
  version?: number | string | null;
  created_at: string;
};

export type VenueFamily<T extends VenueVersionLike> = {
  family: string;
  /** A versão que vale hoje — a de número mais alto. */
  latest: T;
  /** As anteriores, da mais recente para a mais antiga. */
  previous: T[];
};

/** Linha antiga, sem família gravada, é família de uma versão só. */
export function familyOf(row: VenueVersionLike): string {
  return row.family_code || row.proposal_code;
}

export function versionOf(row: VenueVersionLike): number {
  const n = Number(row.version);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Agrupa as propostas por família, com a versão vigente à frente.
 *
 * A ordem das famílias segue a lista recebida (já vem da mais recente), para
 * a listagem não embaralhar quando uma versão nova é criada.
 */
export function groupVenueVersions<T extends VenueVersionLike>(
  rows: T[],
): VenueFamily<T>[] {
  const porFamilia = new Map<string, T[]>();

  rows.forEach((row) => {
    const chave = familyOf(row);
    const lista = porFamilia.get(chave) ?? [];
    lista.push(row);
    porFamilia.set(chave, lista);
  });

  return Array.from(porFamilia.entries()).map(([family, lista]) => {
    const ordenadas = [...lista].sort((a, b) => versionOf(b) - versionOf(a));
    const [latest, ...previous] = ordenadas;
    return { family, latest, previous };
  });
}
