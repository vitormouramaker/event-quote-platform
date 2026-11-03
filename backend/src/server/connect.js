const { Pool } = require('pg');

const postgres = new Pool({
  database: process.env.DB_NAME     || 'event_quote',
  user:     process.env.DB_USER     || 'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  password: process.env.DB_PASS     || 'postgres',
  port:     parseInt(process.env.DB_PORT || '5432'),

  // Pool de conexões
  max: 10,
  idleTimeoutMillis: 30000,             // libera conexões ociosas após 30s
  connectionTimeoutMillis: 10000,       // aguarda até 10s para obter conexão
  allowExitOnIdle: true,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

});

postgres.on('connect', () => {
  console.log('\x1b[36m✔ PostgreSQL conectado\x1b[0m');
});

postgres.on('error', (err) => {
  console.error('\x1b[31m✘ Erro no pool PostgreSQL:\x1b[0m', err.message);
});


/**
 * Tabela de precos do Centro de Eventos Aurora Hall.
 *
 * Semeada uma unica vez (ON CONFLICT DO NOTHING): a partir dai quem manda e o
 * que o gestor editou na tela, nao este arquivo. Valores ficticios de
 * demonstracao.
 */
const VENUE_SETTINGS_PADRAO = {
  entrances: [
    { id: 'principal', name: 'Entrada Principal', description: 'Acesso pelo salao principal', price: 83500 },
    { id: 'setor_b',   name: 'Entrada Setor B',   description: 'Acesso pelo Setor B',         price: 49500 },
    { id: 'setor_c',   name: 'Entrada Setor C',   description: 'Acesso pelo Setor C',         price: 32500 },
  ],
  optionals: [
    { id: 'estacionamento',    name: 'Estacionamento',       condition: 'Opcional',                      price: 3400, perDay: false },
    { id: 'praca_alimentacao', name: 'Praca de alimentacao', condition: 'Opcional',                      price: 3400, perDay: false },
    { id: 'cozinha',           name: 'Cozinha',              condition: 'Diaria / opcional',             price: 1600, perDay: true  },
    { id: 'camara_fria',       name: 'Camara fria',          condition: 'Diaria de 24 horas / opcional', price: 830, perDay: true  },
  ],
  // Climatizacao esta inclusa nos dias de evento, mas nao na montagem e na
  // desmontagem; nesses dias e cobrada por dia.
  climateControlDailyRate: 7750,
  // Dias extras de montagem/desmontagem custam metade da tarifa do espaco.
  extraDailyPercent: 50,
  // Dias de montagem e desmontagem ja inclusos na locacao.
  includedSetupDays: 1,
  includedTeardownDays: 1,
  validityDays: 15,
};

// Graceful shutdown
process.on('SIGINT',  async () => { await postgres.end(); process.exit(0); });
process.on('SIGTERM', async () => { await postgres.end(); process.exit(0); });

/**
 * Tabelas base. Em producao elas ja existiam antes das migracoes abaixo (que
 * so acrescentam colunas e tabelas novas). Aqui elas sao criadas com
 * IF NOT EXISTS para que um banco VAZIO chegue ao mesmo estado: em banco ja
 * existente nada muda.
 */
async function ensureBaseSchema() {
  await postgres.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await postgres.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_status') THEN
        CREATE TYPE budget_status AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');
      END IF;
    END $$;
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      login VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'ADM_ORCAMENTO',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      perm_create_budget BOOLEAN NOT NULL DEFAULT FALSE,
      perm_edit_budget BOOLEAN NOT NULL DEFAULT FALSE,
      perm_delete_budget BOOLEAN NOT NULL DEFAULT FALSE,
      perm_view_all_budgets BOOLEAN NOT NULL DEFAULT FALSE,
      perm_approve_discounts BOOLEAN NOT NULL DEFAULT FALSE,
      perm_approve_edit_requests BOOLEAN NOT NULL DEFAULT FALSE,
      perm_manage_users BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_code VARCHAR(20),
      instituicao TEXT NOT NULL DEFAULT '',
      curso TEXT NOT NULL DEFAULT '',
      comissao TEXT,
      telefone VARCHAR(40),
      controle VARCHAR(80),
      observation TEXT,
      total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      original_total_value NUMERIC(14,2),
      deficit_value NUMERIC(14,2),
      discount_percent NUMERIC(14,6) NOT NULL DEFAULT 0,
      approved_item_discounts JSONB NOT NULL DEFAULT '{}'::jsonb,
      form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      status budget_status NOT NULL DEFAULT 'PENDING',
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`CREATE INDEX IF NOT EXISTS idx_budgets_created_by ON budgets (created_by_user_id)`);
  await postgres.query(`CREATE INDEX IF NOT EXISTS idx_budgets_code ON budgets (budget_code)`);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS discount_requests (
      id SERIAL PRIMARY KEY,
      budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL DEFAULT '',
      total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(14,6) NOT NULL DEFAULT 0,
      original_discount_percent NUMERIC(14,6),
      discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      final_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      requested_by VARCHAR(255),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      request_observation TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
      approved_by VARCHAR(255),
      approved_at TIMESTAMPTZ,
      observation TEXT,
      new_discount_percent NUMERIC(14,6)
    )
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS item_discount_requests (
      id SERIAL PRIMARY KEY,
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL DEFAULT '',
      event_id VARCHAR(160) NOT NULL,
      item_id VARCHAR(160) NOT NULL,
      item_name TEXT,
      original_unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      requested_percentage NUMERIC(14,6) NOT NULL DEFAULT 0,
      requested_by VARCHAR(255),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
      approved_by VARCHAR(255),
      approved_at TIMESTAMPTZ,
      observation TEXT,
      new_discount_percent NUMERIC(14,6),
      CONSTRAINT uq_item_discount_requests UNIQUE (budget_id, event_id, item_id, status)
    )
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS edit_requests (
      id SERIAL PRIMARY KEY,
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL DEFAULT '',
      requested_by VARCHAR(255),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
      approved_by VARCHAR(255),
      approved_at TIMESTAMPTZ,
      observation TEXT
    )
  `);
}

async function runMigrations() {
  await ensureBaseSchema();
  const roleColumn = await postgres.query(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  `);
  if (roleColumn.rows[0]?.data_type === 'USER-DEFINED') {
    const enumName = roleColumn.rows[0].udt_name;
    const analystRoleExists = await postgres.query(`
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1
        AND e.enumlabel = 'ADM_ANALISTA_ORCAMENTO'
    `, [enumName]);
    if (analystRoleExists.rows.length === 0) {
      await postgres.query(`ALTER TYPE "${enumName}" ADD VALUE 'ADM_ANALISTA_ORCAMENTO'`);
    }
  }
  const roleConstraints = await postgres.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  `);
  for (const row of roleConstraints.rows) {
    const definition = String(row.definition || '');
    const isLegacyRoleConstraint =
      definition.includes('ADM_MASTER') &&
      definition.includes('ADM_GERENTE') &&
      definition.includes('ADM_ORCAMENTO') &&
      !definition.includes('ADM_ANALISTA_ORCAMENTO');
    if (isLegacyRoleConstraint) {
      await postgres.query(`ALTER TABLE users DROP CONSTRAINT "${row.conname}"`);
    }
  }
  await postgres.query(`
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('ADM_MASTER', 'ADM_GERENTE', 'ADM_ORCAMENTO', 'ADM_ANALISTA_ORCAMENTO'))
      NOT VALID
  `).catch((error) => {
    if (!String(error.message || error).includes('already exists')) throw error;
  });
  await postgres.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS perm_view_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS perm_view_logs      BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await postgres.query(`
    ALTER TABLE discount_requests
      ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(500),
      ADD COLUMN IF NOT EXISTS attachment_url  VARCHAR(1000)
  `);
  await postgres.query(`
    ALTER TABLE item_discount_requests
      ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(500),
      ADD COLUMN IF NOT EXISTS attachment_url  VARCHAR(1000)
  `);
  // Desconto em valor fixo (R$) ao lado do desconto em percentual.
  //
  // `discount_mode` diz o que o consultor pediu; o percentual equivalente
  // continua sendo gravado nas colunas antigas para que todo o calculo e os
  // relatorios ja existentes sigam funcionando sem mudanca. As colunas de
  // valor abaixo sao a fonte da verdade quando o modo e FIXED, porque um
  // percentual arredondado nao reproduz os centavos pedidos.
  await postgres.query(`
    ALTER TABLE discount_requests
      ADD COLUMN IF NOT EXISTS discount_mode      VARCHAR(10)   NOT NULL DEFAULT 'PERCENT',
      ADD COLUMN IF NOT EXISTS requested_amount   NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS new_discount_value NUMERIC(12,2)
  `);
  await postgres.query(`
    ALTER TABLE item_discount_requests
      ADD COLUMN IF NOT EXISTS discount_mode       VARCHAR(10)   NOT NULL DEFAULT 'PERCENT',
      ADD COLUMN IF NOT EXISTS requested_amount    NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS new_discount_amount NUMERIC(12,2)
  `);
  await postgres.query(`
    ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS discount_mode                  VARCHAR(10) NOT NULL DEFAULT 'PERCENT',
      ADD COLUMN IF NOT EXISTS discount_amount                NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS approved_item_discount_amounts JSONB       NOT NULL DEFAULT '{}'::jsonb
  `);
  // Adiciona SENT_FOR_APPROVAL ao enum de status de orçamento (idempotente)
  const enumCheck = await postgres.query(`
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'budget_status' AND e.enumlabel = 'SENT_FOR_APPROVAL'
  `);
  if (enumCheck.rows.length === 0) {
    await postgres.query(`ALTER TYPE budget_status ADD VALUE 'SENT_FOR_APPROVAL'`);
  }

  // Arquivamento de orçamentos (somente admin)
  await postgres.query(`
    ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS archived_by_name VARCHAR(255)
  `);
  // archived_by_user_id deve casar com o tipo de users.id (UUID neste schema).
  // Se a coluna foi criada antes como INTEGER, corrigir agora.
  const archivedByUserIdCol = await postgres.query(`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'budgets'
      AND column_name = 'archived_by_user_id'
  `);
  if (archivedByUserIdCol.rows.length === 0) {
    await postgres.query(`ALTER TABLE budgets ADD COLUMN archived_by_user_id UUID`);
  } else if (archivedByUserIdCol.rows[0].data_type !== 'uuid') {
    await postgres.query(`ALTER TABLE budgets DROP COLUMN archived_by_user_id`);
    await postgres.query(`ALTER TABLE budgets ADD COLUMN archived_by_user_id UUID`);
  }
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_budgets_archived_at
      ON budgets (archived_at)
      WHERE archived_at IS NOT NULL
  `);

  // Token de compartilhamento do demonstrativo (link público read-only p/ o cliente).
  await postgres.query(`
    ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS share_token VARCHAR(64)
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_share_token
      ON budgets (share_token)
      WHERE share_token IS NOT NULL
  `);

  // Data de aprovação do orçamento — base do fechamento de comissões (a comissão
  // do consultor nasce quando o orçamento é aprovado).
  await postgres.query(`
    ALTER TABLE budgets
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
  `);
  // Backfill: orçamentos já aprovados sem data → usa updated_at como aproximação.
  await postgres.query(`
    UPDATE budgets
      SET approved_at = updated_at
      WHERE status = 'APPROVED' AND approved_at IS NULL
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_budgets_approved_at
      ON budgets (approved_at)
      WHERE approved_at IS NOT NULL
  `);

  // --- NOVAS MUDANÇAS ---

  // Tabela de Itens Base
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      legacy_item_id VARCHAR(160),
      name VARCHAR(255) NOT NULL,
      unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
      default_quantity INTEGER NOT NULL DEFAULT 1,
      cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
      editable BOOLEAN NOT NULL DEFAULT FALSE,
      dynamic_by_students BOOLEAN NOT NULL DEFAULT FALSE,
      has_subitems BOOLEAN NOT NULL DEFAULT FALSE,
      subitems JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS legacy_item_id VARCHAR(160),
      ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS item_kind VARCHAR(40) NOT NULL DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS category VARCHAR(60),
      ADD COLUMN IF NOT EXISTS editable BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS dynamic_by_students BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS has_subitems BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS subitems JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS variations JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS has_additional BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS additional_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS has_multiplier BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS multiplier_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS value_visible_to_client BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_items_legacy_item_id
      ON items (legacy_item_id)
      WHERE legacy_item_id IS NOT NULL
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_items_slug
      ON items (slug)
      WHERE slug IS NOT NULL
  `);

  // Tabela de Modelos de Evento
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_templates (
      id SERIAL PRIMARY KEY,
      legacy_event_id VARCHAR(120),
      name VARCHAR(255) NOT NULL,
      city VARCHAR(100) NOT NULL,
      type VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    ALTER TABLE event_templates
      ADD COLUMN IF NOT EXISTS legacy_event_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
      ADD COLUMN IF NOT EXISTS unit_price_editable BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS requires_min_events BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS group_id VARCHAR(160),
      -- Evento que fecha um quadro proprio no resumo final do orcamento (ex.: o
      -- baile, que vem depois do "valor total ate a colacao"). Default FALSE:
      -- nenhum evento existente muda de comportamento ate ser marcado na tela.
      ADD COLUMN IF NOT EXISTS closes_summary_block BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS summary_block_label TEXT,
      -- Antes criadas por scripts avulsos; aqui para um banco novo nascer completo.
      ADD COLUMN IF NOT EXISTS value NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS has_administration BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // Família multi-cidade: eventos com o mesmo nome (em cidades diferentes) viram
  // uma família (abas por cidade na tela do evento). Backfill por nome normalizado.
  await postgres.query(`
    UPDATE event_templates
      SET group_id = md5(lower(trim(name)))
      WHERE group_id IS NULL
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_event_templates_group_id
      ON event_templates (group_id)
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_templates_legacy_event_id
      ON event_templates (legacy_event_id)
      WHERE legacy_event_id IS NOT NULL
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_templates_slug
      ON event_templates (slug)
      WHERE slug IS NOT NULL
  `);
  // Cidades agora são dinâmicas (tabela cities). Remove o CHECK fixo antigo
  // (Capital/Interior) para permitir qualquer cidade cadastrada.
  await postgres.query(`
    ALTER TABLE event_templates DROP CONSTRAINT IF EXISTS event_templates_city_check
  `);
  await postgres.query(`
    ALTER TABLE event_templates
      ADD CONSTRAINT event_templates_type_check
      CHECK (type IN ('Pago', 'Cortesia'))
      NOT VALID
  `).catch((error) => {
    if (!String(error.message || error).includes('already exists')) throw error;
  });
  await postgres.query(`
    ALTER TABLE items
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW(),
      ALTER COLUMN name TYPE TEXT
  `);
  await postgres.query(`
    ALTER TABLE event_templates
      ALTER COLUMN created_at SET DEFAULT NOW(),
      ALTER COLUMN updated_at SET DEFAULT NOW()
  `);
  // Tabela Pivô (Relacionamento Evento <-> Item)
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_template_items (
      event_template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      PRIMARY KEY (event_template_id, item_id)
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_event_template_items_item_id
      ON event_template_items (item_id)
  `);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_template_item_configs (
      id SERIAL PRIMARY KEY,
      event_template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      sort_order INTEGER,
      is_group_header BOOLEAN NOT NULL DEFAULT FALSE,
      group_title TEXT,
      display_value VARCHAR(120),
      fixed_qty NUMERIC(15, 2),
      quantity_editable BOOLEAN NOT NULL DEFAULT TRUE,
      price_editable BOOLEAN NOT NULL DEFAULT TRUE,
      dynamic_by_students BOOLEAN NOT NULL DEFAULT FALSE,
      derived_rule_mode VARCHAR(20),
      derived_rule_value NUMERIC(15, 2),
      item_role VARCHAR(40) NOT NULL DEFAULT 'standard',
      summary_group VARCHAR(120),
      selector_slug VARCHAR(160),
      selector_options JSONB NOT NULL DEFAULT '[]'::jsonb,
      include_in_financial_sum BOOLEAN NOT NULL DEFAULT TRUE,
      display_only BOOLEAN NOT NULL DEFAULT FALSE,
      formula_slug VARCHAR(160),
      participant_source VARCHAR(80),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT event_template_item_configs_mode_chk
        CHECK (derived_rule_mode IN ('fixed', 'same', 'add', 'multiply') OR derived_rule_mode IS NULL)
    )
  `);
  await postgres.query(`
    ALTER TABLE event_template_item_configs
      ADD COLUMN IF NOT EXISTS item_role VARCHAR(40) NOT NULL DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS summary_group VARCHAR(120),
      ADD COLUMN IF NOT EXISTS selector_slug VARCHAR(160),
      ADD COLUMN IF NOT EXISTS selector_options JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS include_in_financial_sum BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS display_only BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS formula_slug VARCHAR(160),
      ADD COLUMN IF NOT EXISTS participant_source VARCHAR(80),
      -- O item pode ser cadastrado de forma diferente em cada evento: estas
      -- colunas espelham os campos do proprio item. NULL = herda o item, que e
      -- o padrao. Mesma ideia das abas de cidade do evento.
      ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15, 2),
      ADD COLUMN IF NOT EXISTS default_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS value_visible_to_client BOOLEAN,
      ADD COLUMN IF NOT EXISTS has_subitems BOOLEAN,
      ADD COLUMN IF NOT EXISTS subitems JSONB,
      ADD COLUMN IF NOT EXISTS has_additional BOOLEAN,
      ADD COLUMN IF NOT EXISTS additional_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS has_multiplier BOOLEAN,
      ADD COLUMN IF NOT EXISTS multiplier_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS variations JSONB
  `);
  await postgres.query(`
    DROP INDEX IF EXISTS uq_event_template_item_configs_evt_item
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_event_template_item_configs_event_item
      ON event_template_item_configs (event_template_id, item_id)
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_event_template_item_configs_event
      ON event_template_item_configs (event_template_id)
  `);
  await postgres.query(`
    ALTER TABLE event_template_item_configs
      ALTER COLUMN group_title TYPE TEXT
  `);

  // Tabela de Sub-itens Base
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS sub_items (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(160),
      name TEXT NOT NULL,
      has_price BOOLEAN NOT NULL DEFAULT FALSE,
      has_quantity BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    ALTER TABLE sub_items
      ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
      ADD COLUMN IF NOT EXISTS has_price BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS has_quantity BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_items_slug
      ON sub_items (slug)
      WHERE slug IS NOT NULL
  `);

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS catalog_selectors (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(160) NOT NULL,
      label TEXT NOT NULL,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_selectors_slug
      ON catalog_selectors (slug)
  `);

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS event_template_summary_rules (
      id SERIAL PRIMARY KEY,
      event_template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
      slug VARCHAR(160) NOT NULL,
      label TEXT NOT NULL,
      rule_type VARCHAR(60) NOT NULL,
      rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_event_template_summary_rules_event
      ON event_template_summary_rules (event_template_id)
  `);

  await postgres.query(`
    CREATE TABLE IF NOT EXISTS legacy_aliases (
      id SERIAL PRIMARY KEY,
      alias_type VARCHAR(20) NOT NULL,
      legacy_key VARCHAR(200) NOT NULL,
      canonical_slug VARCHAR(160) NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_aliases_type_key
      ON legacy_aliases (alias_type, legacy_key)
  `);

  // Tabela de Auditórios
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS auditoriums (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug VARCHAR(160) NOT NULL,
      price NUMERIC(15, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoriums_slug
      ON auditoriums (slug)
  `);
  // Quando true, o consultor pode editar o valor deste auditório no orçamento.
  await postgres.query(`
    ALTER TABLE auditoriums
      ADD COLUMN IF NOT EXISTS allow_budget_edit BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // Cidade do auditório: só aparece nos orçamentos daquela cidade.
  // NULL = disponível em todas as cidades (comportamento dos cadastros antigos).
  await postgres.query(`
    ALTER TABLE auditoriums
      ADD COLUMN IF NOT EXISTS city VARCHAR(100)
  `);
  // Seed dos auditórios padrão (Platina e Cristal), valores fictícios
  await postgres.query(`
    INSERT INTO auditoriums (name, slug, price) VALUES
      ('Platina', 'platina', 13500),
      ('Cristal', 'cristal', 7000)
    ON CONFLICT (slug) DO NOTHING
  `);

  // Tabela de Cidades (cidade/local do orçamento) — dinâmica, gerida pelo admin.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_name_lower
      ON cities (LOWER(TRIM(name)))
  `);
  // Cidades padrão.
  await postgres.query(`
    INSERT INTO cities (name)
    SELECT v.name FROM (VALUES ('Capital'), ('Interior')) AS v(name)
    WHERE NOT EXISTS (SELECT 1 FROM cities c WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(v.name)))
  `);

  // Devolutivas (análise do orçamento pelo analista) — thread com histórico.
  // kind: 'devolutiva' (analista aponta ajustes) | 'resposta' (criador/adm informa
  // que sanou) | 'aprovacao' (analista aprova). O status atual é derivado do
  // último item do thread.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS budget_reviews (
      id SERIAL PRIMARY KEY,
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      author_user_id UUID,
      author_name VARCHAR(255),
      author_role VARCHAR(60),
      kind VARCHAR(20) NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT budget_reviews_kind_chk CHECK (kind IN ('devolutiva', 'resposta', 'aprovacao'))
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_budget_reviews_budget
      ON budget_reviews (budget_id, created_at)
  `);

  // Contratos gerados a partir do modelo padrao. `variables` guarda os valores
  // dos campos {{}} preenchidos; `title` = curso/turma (rotulo do card).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      variables JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_contracts_updated_at
      ON contracts (updated_at DESC)
  `);

  // Anexo contratual: "foto" assinavel do orcamento aprovado. Aponta para a
  // versao atual do orcamento (budget_id) e e unico por familia (budget_code).
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS contract_annexes (
      id SERIAL PRIMARY KEY,
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      budget_code TEXT,
      title TEXT NOT NULL DEFAULT '',
      signature_date TEXT,
      signature_names JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_user_id UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Um anexo por familia de orcamento (as versoes compartilham o budget_code).
  await postgres.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_annexes_budget_code
      ON contract_annexes (budget_code)
      WHERE budget_code IS NOT NULL
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_contract_annexes_budget
      ON contract_annexes (budget_id)
  `);
  // Eventos cortesia adicionados so no anexo (nao mexem no orcamento).
  await postgres.query(`
    ALTER TABLE contract_annexes
      ADD COLUMN IF NOT EXISTS courtesy_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  // ---------------------------------------------------------------------
  // Proposta de locacao do Centro de Eventos Aurora Hall.
  //
  // E um produto diferente do orcamento de formatura: nao tem formandos,
  // eventos nem parcela por aluno. Por isso vive em tabela propria, com fluxo
  // e impressao proprios, sem tocar em `budgets`.
  //
  // `data` guarda o snapshot completo do que foi proposto, inclusive os PRECOS
  // usados: mudar a tabela de precos depois nao pode alterar uma proposta ja
  // emitida.
  // ---------------------------------------------------------------------
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS venue_proposals (
      id SERIAL PRIMARY KEY,
      proposal_code VARCHAR(20) NOT NULL UNIQUE,
      client_name VARCHAR(255) NOT NULL DEFAULT '',
      event_type VARCHAR(255) NOT NULL DEFAULT '',
      guests INTEGER,
      event_date DATE,
      event_time VARCHAR(80),
      setup_days INTEGER NOT NULL DEFAULT 1,
      teardown_days INTEGER NOT NULL DEFAULT 1,
      entrance_id VARCHAR(40) NOT NULL DEFAULT '',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_mode VARCHAR(10) NOT NULL DEFAULT 'PERCENT',
      discount_percent NUMERIC(14,6) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_reason TEXT,
      discount_status VARCHAR(12) NOT NULL DEFAULT 'NONE',
      discount_reviewed_by VARCHAR(255),
      discount_reviewed_at TIMESTAMPTZ,
      discount_observation TEXT,
      total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      valid_until DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      observation TEXT,
      created_by_user_id UUID,
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_venue_proposals_created_at
      ON venue_proposals (created_at DESC)
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_venue_proposals_discount_status
      ON venue_proposals (discount_status)
      WHERE discount_status = 'PENDING'
  `);
  // O evento pode durar varios dias; `event_date` e o inicio.
  await postgres.query(`
    ALTER TABLE venue_proposals
      ADD COLUMN IF NOT EXISTS event_end_date DATE
  `);
  // Ciclo de vida da proposta, espelhando o do orcamento: o consultor manda
  // para aprovacao, o gestor aprova ou devolve, e a aprovada fica travada.
  await postgres.query(`
    ALTER TABLE venue_proposals
      ADD COLUMN IF NOT EXISTS is_locked          BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by        VARCHAR(255),
      ADD COLUMN IF NOT EXISTS status_observation TEXT
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_venue_proposals_status
      ON venue_proposals (status)
  `);
  // Versionamento: editar uma proposta ja enviada ou aprovada nao reescreve o
  // documento, cria a versao seguinte. `family_code` agrupa as versoes; nas
  // linhas antigas ele e nulo e a leitura cai no proprio proposal_code, entao
  // nao e preciso reescrever nada.
  await postgres.query(`
    ALTER TABLE venue_proposals
      ADD COLUMN IF NOT EXISTS family_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS version     INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS parent_id   INTEGER
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_venue_proposals_family
      ON venue_proposals (COALESCE(family_code, proposal_code), version DESC)
  `);

  // Tabela de precos do espaco: uma linha so, editavel pelo gestor. Os valores
  // iniciais sao os da proposta comercial de referencia.
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS venue_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_name VARCHAR(255),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT venue_settings_linha_unica CHECK (id = 1)
    )
  `);
  await postgres.query(`
    INSERT INTO venue_settings (id, data) VALUES (1, $1::jsonb)
    ON CONFLICT (id) DO NOTHING
  `, [JSON.stringify(VENUE_SETTINGS_PADRAO)]);

  // Limpeza e deduplicação de itens: remove sufixo de evento e colapsa duplicatas reais
  await postgres.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      -- 1) Limpa sufixos de evento entre parênteses em qualquer item.
      UPDATE items
      SET name = TRIM(REGEXP_REPLACE(name, E'\\s*\\([^)]*\\)\\s*$', ''))
      WHERE name ~ E'\\s*\\([^)]+\\)\\s*$'
        AND TRIM(REGEXP_REPLACE(name, E'\\s*\\([^)]*\\)\\s*$', '')) <> '';

      -- 2) Deduplica por slug, alias canônico ou nome limpo normalizado.
      FOR r IN
        WITH normalized_items AS (
          SELECT
            i.id,
            i.legacy_item_id,
            i.slug,
            i.name,
            la.canonical_slug AS alias_canonical_slug,
            REGEXP_REPLACE(LOWER(TRIM(i.name)), E'\\s+', ' ', 'g') AS normalized_name
          FROM items i
          LEFT JOIN legacy_aliases la
            ON la.legacy_key = i.legacy_item_id
           AND la.alias_type = 'item'
        ),
        ranked AS (
          SELECT
            ni.*,
            COALESCE(
              NULLIF(ni.slug, ''),
              NULLIF(ni.alias_canonical_slug, ''),
              REPLACE(ni.normalized_name, ' ', '_')
            ) AS dedupe_key,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(
                NULLIF(ni.slug, ''),
                NULLIF(ni.alias_canonical_slug, ''),
                REPLACE(ni.normalized_name, ' ', '_')
              )
              ORDER BY
                (CASE WHEN ni.slug IS NOT NULL THEN 0 ELSE 1 END) ASC,
                (CASE WHEN ni.alias_canonical_slug IS NOT NULL THEN 0 ELSE 1 END) ASC,
                (CASE WHEN ni.legacy_item_id IS NOT NULL THEN 0 ELSE 1 END) ASC,
                ni.id ASC
            ) AS rn
          FROM normalized_items ni
        ),
        winners AS (
          SELECT id, dedupe_key, slug, alias_canonical_slug
          FROM ranked
          WHERE rn = 1
        ),
        losers AS (
          SELECT id, legacy_item_id, dedupe_key
          FROM ranked
          WHERE rn > 1
        )
        SELECT
          l.id AS loser_id,
          l.legacy_item_id AS loser_legacy_item_id,
          w.id AS winner_id,
          COALESCE(NULLIF(w.slug, ''), NULLIF(w.alias_canonical_slug, '')) AS winner_canonical_slug
        FROM losers l
        JOIN winners w ON w.dedupe_key = l.dedupe_key
      LOOP
        -- Mantém alias legado apontando para item vencedor quando houver slug canônico conhecido.
        IF r.loser_legacy_item_id IS NOT NULL AND r.winner_canonical_slug IS NOT NULL THEN
          INSERT INTO legacy_aliases (alias_type, legacy_key, canonical_slug, notes)
          VALUES ('item', r.loser_legacy_item_id, r.winner_canonical_slug, 'dedupe_items_cleanup')
          ON CONFLICT (alias_type, legacy_key) DO UPDATE
          SET canonical_slug = EXCLUDED.canonical_slug,
              notes = EXCLUDED.notes;
        END IF;

        -- Redireciona event_template_items (PK = event_template_id + item_id, sem duplicar).
        INSERT INTO event_template_items (event_template_id, item_id)
        SELECT event_template_id, r.winner_id
        FROM event_template_items
        WHERE item_id = r.loser_id
        ON CONFLICT DO NOTHING;

        DELETE FROM event_template_items WHERE item_id = r.loser_id;

        -- Redireciona event_template_item_configs.
        UPDATE event_template_item_configs
        SET item_id = r.winner_id
        WHERE item_id = r.loser_id;

        -- Deleta item duplicado.
        DELETE FROM items WHERE id = r.loser_id;
      END LOOP;
    END $$;
  `);

  console.log('\x1b[36m✔ Migrações aplicadas\x1b[0m');
}

module.exports = { postgres, runMigrations };
