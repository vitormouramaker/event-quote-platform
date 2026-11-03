/**
 * Contas ficticias para rodar o sistema localmente, uma por perfil. Pode rodar
 * de novo: quem ja existe so tem a senha e as permissoes redefinidas.
 *
 *   npm run seed:demo                       senha padrao Demo@2026
 *   DEMO_PASSWORD="OutraSenha@1" npm run seed:demo
 *
 * Trava de seguranca: nao roda com NODE_ENV=production.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { postgres, runMigrations } = require('../server/connect');

const ALL = {
  perm_create_budget: true,
  perm_edit_budget: true,
  perm_delete_budget: true,
  perm_view_all_budgets: true,
  perm_approve_discounts: true,
  perm_approve_edit_requests: true,
  perm_manage_users: true,
  perm_view_dashboard: true,
  perm_view_logs: true,
};
const NONE = Object.fromEntries(Object.keys(ALL).map((key) => [key, false]));

const CONTAS = [
  { login: 'admin', name: 'Administrador Demo', role: 'ADM_MASTER', perms: ALL },
  {
    login: 'gerente',
    name: 'Gerente Demo',
    role: 'ADM_GERENTE',
    perms: { ...ALL, perm_manage_users: false },
  },
  {
    login: 'consultor',
    name: 'Consultor Demo',
    role: 'ADM_ORCAMENTO',
    perms: { ...NONE, perm_create_budget: true, perm_edit_budget: true },
  },
  { login: 'analista', name: 'Analista Demo', role: 'ADM_ANALISTA_ORCAMENTO', perms: NONE },
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este roteiro cria contas com senha conhecida e nao roda em producao.');
  }

  const senha = String(process.env.DEMO_PASSWORD || '').trim() || 'Demo@2026';
  const hash = bcrypt.hashSync(senha, 10);
  await runMigrations();

  for (const conta of CONTAS) {
    const p = conta.perms;
    await postgres.query(
      `
        INSERT INTO users (
          name, login, password_hash, role, active,
          perm_create_budget, perm_edit_budget, perm_delete_budget,
          perm_view_all_budgets, perm_approve_discounts, perm_approve_edit_requests,
          perm_manage_users, perm_view_dashboard, perm_view_logs
        ) VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (login) DO UPDATE SET
          name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          active = TRUE,
          perm_create_budget = EXCLUDED.perm_create_budget,
          perm_edit_budget = EXCLUDED.perm_edit_budget,
          perm_delete_budget = EXCLUDED.perm_delete_budget,
          perm_view_all_budgets = EXCLUDED.perm_view_all_budgets,
          perm_approve_discounts = EXCLUDED.perm_approve_discounts,
          perm_approve_edit_requests = EXCLUDED.perm_approve_edit_requests,
          perm_manage_users = EXCLUDED.perm_manage_users,
          perm_view_dashboard = EXCLUDED.perm_view_dashboard,
          perm_view_logs = EXCLUDED.perm_view_logs,
          updated_at = NOW()
      `,
      [
        conta.name, conta.login, hash, conta.role,
        p.perm_create_budget, p.perm_edit_budget, p.perm_delete_budget,
        p.perm_view_all_budgets, p.perm_approve_discounts, p.perm_approve_edit_requests,
        p.perm_manage_users, p.perm_view_dashboard, p.perm_view_logs,
      ],
    );
    console.log(`conta pronta: ${conta.login} (${conta.role})`);
  }
  console.log(`senha das contas: ${senha}`);
}

main()
  .catch((error) => {
    console.error('Erro ao criar as contas de demonstracao:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => postgres.end());
