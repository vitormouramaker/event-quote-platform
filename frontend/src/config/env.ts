// ─────────────────────────────────────────────────────────────────────────────
// AMBIENTE
//
// `VITE_API_URL` é lida no BUILD — o Vite injeta o valor no bundle, não existe
// leitura em tempo de execução. Sem a variável, o front aponta para a API local
// (http://localhost:4444). Para outra API, crie `frontend/.env.local` com
// `VITE_API_URL=https://sua-api.example.com` ou passe a variável no build.
// ─────────────────────────────────────────────────────────────────────────────

const PADRAO = "http://localhost:4444";

const apiUrlFromEnv = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE_URL = apiUrlFromEnv?.trim() ? apiUrlFromEnv.trim() : PADRAO;

/** "homolog" no ambiente de homologação; vazio em produção. */
export const APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? "";

/** Liga a faixa de aviso para ninguém confundir homologação com produção. */
export const IS_HOMOLOG = APP_ENV === "homolog";
