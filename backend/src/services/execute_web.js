const models   = require('../models/models_web');
const { postgres } = require('../server/connect');
const security = require('../security/auth');

/** Gera um código único para identificar a família de versões de um orçamento. */
function _generateBudgetCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'ORC-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Modo do desconto: 'FIXED' quando o pedido vem em reais, 'PERCENT' no resto.
 * O multipart manda tudo como string, por isso a comparacao e por texto.
 */
function _discountMode(raw) {
    return String(raw || '').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT';
}

/**
 * Numero ou NULL. `Number(null)` e `Number('')` dao 0, e um 0 gravado no lugar
 * de NULL faria "sem valor" virar "valor zero" nas telas.
 */
function _numeroOuNulo(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const numero = Number(raw);
    return Number.isFinite(numero) ? numero : null;
}

/** Codigo da proposta de locacao, no mesmo espirito do codigo do orcamento. */
function _generateProposalCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'PROP-' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Status da proposta de locacao; qualquer coisa fora da lista vira PENDING. */
function _venueStatus(raw) {
    const valor = String(raw || '').toUpperCase();
    return ['PENDING', 'SENT_FOR_APPROVAL', 'APPROVED', 'CANCELLED'].includes(valor)
        ? valor
        : 'PENDING';
}

/** Estado do desconto da proposta; qualquer coisa fora da lista vira NONE. */
function _discountStatus(raw) {
    const valor = String(raw || '').toUpperCase();
    return ['PENDING', 'APPROVED', 'REJECTED'].includes(valor) ? valor : 'NONE';
}

/** Data (YYYY-MM-DD) ou NULL: string vazia em coluna DATE e erro no Postgres. */
function _dataOuNulo(raw) {
    const valor = String(raw || '').trim();
    return valor ? valor : null;
}

const DASHBOARD_PRESETS = new Set(['today', '3m', '6m', 'custom']);
const DASHBOARD_STATUSES = new Set(['PENDING', 'SENT_FOR_APPROVAL', 'APPROVED', 'CANCELLED']);
const DASHBOARD_ARCHIVED_MODES = new Set(['exclude', 'only', 'include']);
const EVENT_TEMPLATE_CITIES = new Set(['Capital', 'Interior']);
const EVENT_TEMPLATE_TYPES = new Set(['Pago', 'Cortesia']);

function normalizeDashboardFilters(raw = {}) {
    const preset = DASHBOARD_PRESETS.has(raw.preset) ? raw.preset : '6m';
    const status = DASHBOARD_STATUSES.has(raw.status) ? raw.status : 'ALL';
    const archived = DASHBOARD_ARCHIVED_MODES.has(raw.archived) ? raw.archived : 'exclude';
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const startDate = typeof raw.startDate === 'string' && datePattern.test(raw.startDate) ? raw.startDate : null;
    const endDate = typeof raw.endDate === 'string' && datePattern.test(raw.endDate) ? raw.endDate : null;
    const seller = typeof raw.seller === 'string' && raw.seller.trim() ? raw.seller.trim() : null;

    return { preset, status, archived, startDate, endDate, seller };
}

function shouldUseDailyBucket(filters) {
    if (filters.preset === 'today') return true;
    if (filters.preset !== 'custom' || !filters.startDate || !filters.endDate) return false;
    const start = new Date(`${filters.startDate}T00:00:00Z`);
    const end = new Date(`${filters.endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return diffDays > 0 && diffDays <= 31;
}

function buildBudgetFilterSql({ user, filters, alias = 'b' }) {
    const conditions = [];
    const values = [];
    const canSeeAllBudgets = security.canViewAllBudgets(user);

    // Filtro de arquivados: exclude (padrão), only (apenas arquivados), include (ambos)
    const archivedMode = filters.archived || 'exclude';
    if (archivedMode === 'exclude') {
        conditions.push(`${alias}.archived_at IS NULL`);
    } else if (archivedMode === 'only') {
        conditions.push(`${alias}.archived_at IS NOT NULL`);
    }

    if (!canSeeAllBudgets) {
        values.push(user?.id || null);
        conditions.push(`${alias}.created_by_user_id = $${values.length}`);
    }

    if (filters.preset === 'today') {
        conditions.push(`${alias}.created_at::date = CURRENT_DATE`);
    } else if (filters.preset === '3m') {
        conditions.push(`${alias}.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '3 months'`);
    } else if (filters.preset === '6m') {
        conditions.push(`${alias}.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 months'`);
    } else if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
        values.push(filters.startDate);
        conditions.push(`${alias}.created_at >= $${values.length}::date`);
        values.push(filters.endDate);
        conditions.push(`${alias}.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    if (filters.status !== 'ALL') {
        values.push(filters.status);
        conditions.push(`${alias}.status = $${values.length}`);
    }

    // Filtro por consultor/vendedor (nome). Todas as métricas derivam deste CTE,
    // então isto faz o dashboard inteiro refletir só os orçamentos do consultor.
    if (filters.seller) {
        values.push(filters.seller);
        conditions.push(`${alias}.created_by_name = $${values.length}`);
    }

    return {
        whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
        values,
        isAdmin: canSeeAllBudgets,
    };
}

/**
 * Mesmo recorte do dashboard, aplicado as propostas de locacao.
 *
 * Vive separado de `buildBudgetFilterSql` porque a tabela nao tem
 * `archived_at` e porque os parametros sao numerados por query: reaproveitar
 * o mesmo array deslocaria os $N da consulta dos orcamentos.
 */
function buildVenueFilterSql({ user, filters, alias = 'v' }) {
    const conditions = [];
    const values = [];

    if (!security.canViewAllBudgets(user)) {
        values.push(user?.id || null);
        conditions.push(`${alias}.created_by_user_id = $${values.length}`);
    }

    if (filters.preset === 'today') {
        conditions.push(`${alias}.created_at::date = CURRENT_DATE`);
    } else if (filters.preset === '3m') {
        conditions.push(`${alias}.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '3 months'`);
    } else if (filters.preset === '6m') {
        conditions.push(`${alias}.created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '6 months'`);
    } else if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
        values.push(filters.startDate);
        conditions.push(`${alias}.created_at >= $${values.length}::date`);
        values.push(filters.endDate);
        conditions.push(`${alias}.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    if (filters.status !== 'ALL') {
        values.push(filters.status);
        conditions.push(`${alias}.status = $${values.length}`);
    }

    if (filters.seller) {
        values.push(filters.seller);
        conditions.push(`${alias}.created_by_name = $${values.length}`);
    }

    return {
        whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
        values,
    };
}

function normalizeItemIds(rawItemIds) {
    if (!Array.isArray(rawItemIds)) return [];
    return [...new Set(
        rawItemIds
            .map((itemId) => Number(itemId))
            .filter((itemId) => Number.isInteger(itemId) && itemId > 0)
    )];
}

function normalizeSubitems(rawSubitems) {
    if (!Array.isArray(rawSubitems)) return [];
    return rawSubitems
        .map((subitem) => {
            if (typeof subitem === 'string') {
                const name = subitem.trim();
                return name ? { name } : null;
            }
            if (!subitem || typeof subitem !== 'object') return null;
            const name = typeof subitem.name === 'string' ? subitem.name.trim() : '';
            if (!name) return null;
            return { id: subitem.id, name };
        })
        .filter(Boolean);
}

function normalizeItemVariations(rawVariations) {
    if (!Array.isArray(rawVariations)) return [];

    return rawVariations
        .map((variation, index) => {
            if (!variation || typeof variation !== 'object') return null;

            const rawId = typeof variation.id === 'string' ? variation.id.trim() : '';
            const name = typeof variation.name === 'string' ? variation.name.trim() : '';
            const unitPrice = Number(variation.unit_price ?? 0);
            const defaultQuantity = Number(variation.default_quantity ?? 1);

            if (!name) return null;

            return {
                id: rawId || `var_${Date.now().toString(36)}_${index}`,
                name,
                unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
                default_quantity:
                    Number.isFinite(defaultQuantity) && defaultQuantity > 0
                        ? Math.floor(defaultQuantity)
                        : 1,
            };
        })
        .filter(Boolean);
}

function normalizeEventTemplatePayload(data = {}) {
    const configModes = new Set(['fixed', 'same', 'add', 'multiply']);
    const normalizedConfigs = Array.isArray(data.event_item_configs)
        ? data.event_item_configs
            .map((cfg) => {
                if (!cfg || typeof cfg !== 'object') return null;
                const itemId = Number(cfg.item_id);
                if (!Number.isInteger(itemId) || itemId <= 0) return null;
                const mode = typeof cfg.derived_rule_mode === 'string' ? cfg.derived_rule_mode : null;
                return {
                    item_id: itemId,
                    sort_order: Number.isFinite(Number(cfg.sort_order)) ? Number(cfg.sort_order) : null,
                    is_group_header: cfg.is_group_header === true,
                    group_title: typeof cfg.group_title === 'string' && cfg.group_title.trim() ? cfg.group_title.trim() : null,
                    display_value: typeof cfg.display_value === 'string' && cfg.display_value.trim() ? cfg.display_value.trim() : null,
                    fixed_qty: Number.isFinite(Number(cfg.fixed_qty)) ? Number(cfg.fixed_qty) : null,
                    quantity_editable: cfg.quantity_editable !== false,
                    price_editable: cfg.price_editable !== false,
                    dynamic_by_students: cfg.dynamic_by_students === true,
                    derived_rule_mode: mode && configModes.has(mode) ? mode : null,
                    derived_rule_value: Number.isFinite(Number(cfg.derived_rule_value)) ? Number(cfg.derived_rule_value) : null,
                };
            })
            .filter(Boolean)
        : [];

    const rawValue = Number(data.value);
    return {
        legacy_event_id: typeof data.legacy_event_id === 'string' && data.legacy_event_id.trim()
            ? data.legacy_event_id.trim()
            : null,
        name: typeof data.name === 'string' ? data.name.trim() : '',
        city: typeof data.city === 'string' && data.city.trim() ? data.city.trim() : null,
        type: EVENT_TEMPLATE_TYPES.has(data.type) ? data.type : null,
        value: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null,
        has_administration: data.has_administration === true,
        unit_price_editable: data.unit_price_editable === true,
        requires_min_events: data.requires_min_events === true,
        // Evento que fecha um quadro proprio no resumo final do orcamento
        // (ex.: o baile entra depois do "valor total ate a colacao").
        closes_summary_block: data.closes_summary_block === true,
        summary_block_label: typeof data.summary_block_label === 'string' && data.summary_block_label.trim()
            ? data.summary_block_label.trim()
            : null,
        // Família multi-cidade. Sem group_id → evento novo ganha família própria.
        group_id: typeof data.group_id === 'string' && data.group_id.trim() ? data.group_id.trim() : null,
        item_ids: normalizeItemIds(data.item_ids),
        event_item_configs: normalizedConfigs,
    };
}

const DERIVED_RULE_MODES = new Set(['fixed', 'same', 'add', 'multiply']);

/** `Number(null)` e 0 — este guarda preserva a diferenca entre zero e vazio. */
function numeroOuNulo(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function normalizeItemPayload(data = {}) {
    const hasAdditional =
        data.has_additional === true ||
        data.has_additional === 'true' ||
        data.has_additional === 'on' ||
        data.has_additional === 1;
    const rawAdditional = Number(data.additional_quantity ?? 0);
    const additionalQuantity = hasAdditional
        ? (Number.isFinite(rawAdditional) && rawAdditional > 0 ? Math.floor(rawAdditional) : 0)
        : 0;
    const hasMultiplier =
        data.has_multiplier === true ||
        data.has_multiplier === 'true' ||
        data.has_multiplier === 'on' ||
        data.has_multiplier === 1;
    const rawMultiplier = Number(data.multiplier_quantity ?? 0);
    const multiplierQuantity = hasMultiplier
        ? (Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? Math.floor(rawMultiplier) : 0)
        : 0;
    return {
        legacy_item_id:
            typeof data.legacy_item_id === 'string' && data.legacy_item_id.trim()
                ? data.legacy_item_id.trim()
                : null,
        name: typeof data.name === 'string' ? data.name.trim() : '',
        unit_price: Number(data.unit_price ?? 0),
        default_quantity: Number(data.default_quantity ?? 1),
        editable: data.editable === true || data.editable === 'true' || data.editable === 'on' || data.editable === 1,
        dynamic_by_students:
            data.dynamic_by_students === true ||
            data.dynamic_by_students === 'true' ||
            data.dynamic_by_students === 'on' ||
            data.dynamic_by_students === 1,
        has_subitems:
            data.has_subitems === true ||
            data.has_subitems === 'true' ||
            data.has_subitems === 'on' ||
            data.has_subitems === 1,
        subitems: normalizeSubitems(data.subitems),
        variations: normalizeItemVariations(data.variations),
        has_additional: hasAdditional,
        additional_quantity: additionalQuantity,
        has_multiplier: hasMultiplier,
        multiplier_quantity: multiplierQuantity,
        value_visible_to_client:
            data.value_visible_to_client === true ||
            data.value_visible_to_client === 'true' ||
            data.value_visible_to_client === 'on' ||
            data.value_visible_to_client === 1,
    };
}

const execute = {

    // ---- AUTH ----
    // Busca pelo login e confere a senha aqui (bcrypt). Hash legado em MD5
    // ainda e aceito uma vez e ja e regravado em bcrypt.
    execute_login: async (login, password) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.login(), [login]);
            const user = ret.rows[0];
            if (!user) return [];
            const check = security.verifyPassword(password, user.password_hash);
            if (!check.ok) return [];
            if (check.needsRehash) {
                await client.query(models.update_password_hash(), [security.hashPassword(password), user.id]);
            }
            delete user.password_hash;
            return [user];
        } finally { client.release(); }
    },

    // ---- USERS ----
    execute_get_all_users: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_users());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_create_user: async (data) => {
        const client = await postgres.connect();
        try {
            const hash = security.hashPassword(data.password);
            const ret  = await client.query(models.create_user(), [
                data.name, data.login, hash, data.role, data.active ?? true,
                data.permissions.createBudget       ?? false,
                data.permissions.editBudget          ?? false,
                data.permissions.deleteBudget        ?? false,
                data.permissions.viewAllBudgets      ?? false,
                data.permissions.approveDiscounts    ?? false,
                data.permissions.approveEditRequests ?? false,
                data.permissions.manageUsers         ?? false,
                data.permissions.viewDashboard       ?? false,
                data.permissions.viewLogs            ?? false,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_user: async (id, data) => {
        const client = await postgres.connect();
        try {
            const perms = [
                data.permissions.createBudget       ?? false,
                data.permissions.editBudget          ?? false,
                data.permissions.deleteBudget        ?? false,
                data.permissions.viewAllBudgets      ?? false,
                data.permissions.approveDiscounts    ?? false,
                data.permissions.approveEditRequests ?? false,
                data.permissions.manageUsers         ?? false,
                data.permissions.viewDashboard       ?? false,
                data.permissions.viewLogs            ?? false,
            ];
            let ret;
            if (data.password) {
                const hash = security.hashPassword(data.password);
                ret = await client.query(models.update_user(), [
                    data.name, data.login, hash, data.role, data.active ?? true,
                    ...perms, id,
                ]);
            } else {
                ret = await client.query(models.update_user_no_password(), [
                    data.name, data.login, data.role, data.active ?? true,
                    ...perms, id,
                ]);
            }
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_user: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_user(), [id]);
        } finally { client.release(); }
    },

    // ---- BUDGETS ----
    execute_get_all_budgets: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_budgets());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_budgets_by_user: async (userId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_budgets_by_user(), [userId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_budget_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_budget_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    // Gera (ou reaproveita) o token de compartilhamento do demonstrativo do
    // orçamento. Token aleatório e URL-safe; não é adivinhável.
    execute_set_budget_share_token: async (id) => {
        const crypto = require('crypto');
        const client = await postgres.connect();
        try {
            const existing = await client.query(models.get_budget_by_id(), [id]);
            const budget = existing.rows[0];
            if (!budget) return null;
            if (budget.share_token) return budget.share_token;
            const token = crypto.randomBytes(24).toString('base64url');
            const ret = await client.query(models.set_budget_share_token(), [id, token]);
            return ret.rows[0].share_token;
        } finally { client.release(); }
    },

    // Payload público read-only do demonstrativo: dados do orçamento + catálogo
    // de eventos + runtime canônico (o front recalcula os valores exatamente como
    // na impressão/tela). Sem informação sensível de usuário além do necessário.
    execute_get_public_demonstrativo: async (token) => {
        if (!token) return null;
        const client = await postgres.connect();
        let budget;
        try {
            const ret = await client.query(models.get_budget_by_share_token(), [token]);
            budget = ret.rows[0] || null;
        } finally { client.release(); }
        if (!budget) return null;
        // Link publico: nada de identificador interno de usuario.
        delete budget.created_by_user_id;
        delete budget.archived_by_user_id;
        const runtimeCatalog = await execute.execute_get_event_template_runtime_catalog();
        return {
            budget,
            eventTemplates: runtimeCatalog.eventTemplates,
            runtimeCatalog,
        };
    },

    execute_create_budget: async (data) => {
        const client = await postgres.connect();
        try {
            // Se não veio budgetCode (orçamento original novo), gera um código único.
            // Versões herdam o budgetCode do orçamento pai.
            const budgetCode = data.budgetCode || _generateBudgetCode();
            const ret = await client.query(models.create_budget(), [
                data.instituicao, data.curso, data.comissao || null,
                data.telefone || null, data.controle || null,
                data.observation || null,
                data.totalValue || 0, data.originalTotalValue || null,
                data.deficitValue || null, data.discountPercent || 0,
                JSON.stringify(data.approvedItemDiscounts || {}),
                JSON.stringify(data.formData || {}),
                data.status || 'PENDING',
                data.isLocked !== undefined ? data.isLocked : true,
                data.createdByUserId || null, data.createdByName || null,
                budgetCode,
                _discountMode(data.discountMode), _numeroOuNulo(data.discountAmount),
                JSON.stringify(data.approvedItemDiscountAmounts || {}),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_budget: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_budget(), [
                data.instituicao, data.curso, data.comissao || null,
                data.telefone || null, data.controle || null,
                data.observation || null,
                data.totalValue || 0, data.originalTotalValue || null,
                data.deficitValue || null, data.discountPercent || 0,
                JSON.stringify(data.approvedItemDiscounts || {}),
                JSON.stringify(data.formData || {}),
                data.status || 'PENDING',
                data.isLocked !== undefined ? data.isLocked : true,
                id,
                _discountMode(data.discountMode), _numeroOuNulo(data.discountAmount),
                JSON.stringify(data.approvedItemDiscountAmounts || {}),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_budget_lock: async (id, isLocked) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_budget_lock(), [isLocked, id]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_archive_budget: async (id, userId, userName) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.archive_budget(), [userId || null, userName || null, id]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_unarchive_budget: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.unarchive_budget(), [id]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_budget_status: async (id, status, observation) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_budget_status(), [status, observation, id, status]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_budget: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_budget(), [id]);
        } finally { client.release(); }
    },

    // ---- DISCOUNT REQUESTS ----
    execute_get_discount_requests: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_discount_requests());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_discount_by_budget: async (budgetId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_discount_requests_by_budget(), [budgetId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_create_discount_request: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_discount_request(), [
                data.budgetId, data.clientName, data.totalValue || 0,
                data.discountPercent || 0, data.discountValue || 0,
                data.finalValue || 0, data.requestedBy, data.requestObservation,
                data.attachmentName || null, data.attachmentUrl || null,
                _discountMode(data.discountMode), _numeroOuNulo(data.requestedAmount),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_discount_status: async (id, status, approvedBy, observation, newPct, newValue) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_discount_request_status(), [
                status, approvedBy, observation, _numeroOuNulo(newPct), id,
                _numeroOuNulo(newValue),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    // ---- ITEM DISCOUNT REQUESTS ----
    execute_get_all_item_requests: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_item_requests());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_item_requests_by_budget: async (budgetId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_item_requests_by_budget(), [budgetId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_create_item_request: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_item_request(), [
                data.budgetId, data.clientName, data.eventId, data.itemId,
                data.itemName, data.originalUnitPrice || 0,
                data.requestedPercentage || 0, data.requestedBy, data.reason,
                data.attachmentName || null, data.attachmentUrl || null,
                _discountMode(data.discountMode), _numeroOuNulo(data.requestedAmount),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_item_request_status: async (budgetId, eventId, itemId, status, approvedBy, observation, newPct, newAmount) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_item_request_status(), [
                status, approvedBy, observation, _numeroOuNulo(newPct), budgetId, eventId, itemId,
                _numeroOuNulo(newAmount),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_item_request: async (budgetId, eventId, itemId) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_item_request(), [budgetId, eventId, itemId]);
        } finally { client.release(); }
    },

    // ---- EDIT REQUESTS ----
    execute_get_edit_requests: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_edit_requests());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_edit_requests_by_budget: async (budgetId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_edit_requests_by_budget(), [budgetId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_create_edit_request: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_edit_request(), [
                data.budgetId, data.clientName, data.requestedBy, data.reason,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_edit_request_status: async (id, status, approvedBy, observation) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_edit_request_status(), [
                status, approvedBy, observation, id,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    // ---- DASHBOARD ----
    execute_get_dashboard_summary: async (user, rawFilters = {}) => {
        const client = await postgres.connect();
        try {
            const filters = normalizeDashboardFilters(rawFilters);
            const budgetScope = buildBudgetFilterSql({ user, filters, alias: 'b' });
            const { whereClause, values, isAdmin } = budgetScope;
            const bucketByDay = shouldUseDailyBucket(filters);

            const trendBucketExpr = bucketByDay
                ? "DATE_TRUNC('day', created_at)"
                : "DATE_TRUNC('month', created_at)";
            const trendKeyExpr = bucketByDay
                ? "TO_CHAR(bucket_date, 'YYYY-MM-DD')"
                : "TO_CHAR(bucket_date, 'YYYY-MM')";
            const trendLabelExpr = bucketByDay
                ? "TO_CHAR(bucket_date, 'DD/MM/YYYY')"
                : "TO_CHAR(bucket_date, 'MM/YYYY')";

            const filteredBudgetsCte = `
                WITH filtered_budgets AS (
                    SELECT b.*
                    FROM budgets b
                    ${whereClause}
                )
            `;

            const metricsSql = `
                ${filteredBudgetsCte}
                SELECT
                    (SELECT COUNT(*)::int FROM filtered_budgets) AS total_budgets,
                    (SELECT COUNT(*)::int FROM filtered_budgets WHERE status = 'PENDING') AS pending_budgets,
                    (SELECT COUNT(*)::int FROM filtered_budgets WHERE status = 'APPROVED') AS approved_budgets,
                    (SELECT COUNT(*)::int FROM filtered_budgets WHERE status = 'CANCELLED') AS cancelled_budgets,
                    (SELECT COUNT(*)::int FROM filtered_budgets WHERE is_locked = true) AS locked_budgets,
                    (SELECT COALESCE(SUM(total_value), 0) FROM filtered_budgets) AS total_budget_value,
                    (
                        SELECT COALESCE(
                            SUM(COALESCE(total_value, original_total_value, 0)),
                            0
                        )
                        FROM filtered_budgets
                        WHERE status = 'APPROVED'
                    ) AS approved_budget_value,
                    (SELECT COALESCE(AVG(total_value), 0) FROM filtered_budgets) AS avg_budget_value,
                    (
                        SELECT COUNT(*)::int
                        FROM discount_requests dr
                        JOIN filtered_budgets fb ON fb.id = dr.budget_id
                        WHERE dr.status = 'PENDING'
                    ) AS pending_discount_requests,
                    (
                        SELECT COUNT(*)::int
                        FROM item_discount_requests ir
                        JOIN filtered_budgets fb ON fb.id = ir.budget_id
                        WHERE ir.status = 'PENDING'
                    ) AS pending_item_discount_requests,
                    (
                        SELECT COUNT(*)::int
                        FROM edit_requests er
                        JOIN filtered_budgets fb ON fb.id = er.budget_id
                        WHERE er.status = 'PENDING'
                    ) AS pending_edit_requests,
                    ${isAdmin ? "(SELECT COUNT(*)::int FROM users WHERE active = true)" : "NULL::int"} AS active_users
            `;

            const statusSql = `
                ${filteredBudgetsCte}
                SELECT status, COUNT(*)::int AS count
                FROM filtered_budgets
                GROUP BY status
                ORDER BY status
            `;

            const trendSql = `
                ${filteredBudgetsCte},
                budget_trend AS (
                    SELECT
                        ${trendBucketExpr} AS bucket_date,
                        COUNT(*)::int AS budget_count,
                        COALESCE(SUM(total_value), 0) AS total_value
                    FROM filtered_budgets
                    GROUP BY 1
                )
                SELECT
                    ${trendKeyExpr} AS month_key,
                    ${trendLabelExpr} AS month_label,
                    budget_count,
                    total_value
                FROM budget_trend
                ORDER BY bucket_date
            `;

            const recentSql = `
                ${filteredBudgetsCte}
                SELECT
                    id,
                    instituicao,
                    curso,
                    comissao,
                    status,
                    is_locked,
                    total_value,
                    created_at,
                    created_by_name
                FROM filtered_budgets
                ORDER BY created_at DESC
                LIMIT 50
            `;

            // Propostas de locacao entram nos numeros gerais: a venda do espaco
            // e receita como qualquer orcamento aprovado.
            const venueScope = buildVenueFilterSql({ user, filters });
            const venueSql = `
                WITH filtered_venue AS (
                    SELECT v.* FROM venue_proposals v
                    ${venueScope.whereClause}
                )
                SELECT
                    (SELECT COUNT(*)::int FROM filtered_venue) AS total_proposals,
                    (SELECT COUNT(*)::int FROM filtered_venue WHERE status = 'PENDING') AS pending_proposals,
                    (SELECT COUNT(*)::int FROM filtered_venue WHERE status = 'SENT_FOR_APPROVAL') AS sent_for_approval_proposals,
                    (SELECT COUNT(*)::int FROM filtered_venue WHERE status = 'APPROVED') AS approved_proposals,
                    (SELECT COUNT(*)::int FROM filtered_venue WHERE status = 'CANCELLED') AS cancelled_proposals,
                    (SELECT COALESCE(SUM(total_value), 0) FROM filtered_venue) AS total_proposal_value,
                    (SELECT COALESCE(SUM(total_value), 0) FROM filtered_venue WHERE status = 'APPROVED') AS approved_proposal_value,
                    (SELECT COUNT(*)::int FROM filtered_venue WHERE discount_status = 'PENDING') AS pending_venue_discounts
            `;

            const [metricsRet, statusRet, trendRet, recentRet, venueRet] = await Promise.all([
                client.query(metricsSql, values),
                client.query(statusSql, values),
                client.query(trendSql, values),
                client.query(recentSql, values),
                client.query(venueSql, venueScope.values),
            ]);

            return {
                filters_applied: filters,
                metrics: metricsRet.rows[0] || {},
                venue_metrics: venueRet.rows[0] || {},
                status_breakdown: statusRet.rows || [],
                monthly_budgets: trendRet.rows || [],
                recent_budgets: recentRet.rows || [],
            };
        } finally { client.release(); }
    },

    // ---- CONFIG DO ITEM POR EVENTO ----
    execute_get_item_event_configs: async (itemId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_item_event_configs(), [itemId]);
            return ret.rows;
        } finally { client.release(); }
    },

    // Grava tudo numa transacao: ou o item fica consistente em todos os
    // eventos, ou nao muda nada.
    execute_save_item_event_configs: async (itemId, configs) => {
        const client = await postgres.connect();
        try {
            await client.query('BEGIN');
            for (const cfg of configs) {
                // Ja existe linha para este par? Atualiza ela. Senao, cria.
                // (a tabela nao tem indice unico de (evento,item) — ver models)
                const atual = await client.query(
                    'SELECT id FROM event_template_item_configs WHERE event_template_id = $1 AND item_id = $2 ORDER BY id ASC LIMIT 1',
                    [cfg.event_template_id, itemId],
                );
                // Mesma ordem nos dois: o conjunto completo de campos do item.
                const valores = [
                    cfg.quantity_editable,
                    cfg.price_editable,
                    cfg.dynamic_by_students,
                    cfg.unit_price,
                    cfg.default_quantity,
                    cfg.value_visible_to_client,
                    cfg.has_subitems,
                    JSON.stringify(cfg.subitems ?? []),
                    cfg.has_additional,
                    cfg.additional_quantity,
                    cfg.has_multiplier,
                    cfg.multiplier_quantity,
                    JSON.stringify(cfg.variations ?? []),
                ];
                if (atual.rows.length > 0) {
                    await client.query(models.update_event_template_item_config(), [
                        atual.rows[0].id,
                        ...valores,
                    ]);
                } else {
                    await client.query(models.insert_item_event_config(), [
                        cfg.event_template_id,
                        itemId,
                        ...valores,
                    ]);
                }
            }
            await client.query('COMMIT');
            const ret = await client.query(models.get_item_event_configs(), [itemId]);
            return ret.rows;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally { client.release(); }
    },

    execute_add_item_to_event: async (itemId, eventTemplateId) => {
        const client = await postgres.connect();
        try {
            await client.query(models.add_item_to_event(), [eventTemplateId, itemId]);
            const ret = await client.query(models.get_item_event_configs(), [itemId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_remove_item_from_event: async (itemId, eventTemplateId) => {
        const client = await postgres.connect();
        try {
            await client.query('BEGIN');
            await client.query(models.remove_item_event_config(), [eventTemplateId, itemId]);
            await client.query(models.remove_item_from_event(), [eventTemplateId, itemId]);
            await client.query('COMMIT');
            const ret = await client.query(models.get_item_event_configs(), [itemId]);
            return ret.rows;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally { client.release(); }
    },

    // ---- ITEMS ----
    execute_get_all_items: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_items());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_all_catalog_selectors: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_catalog_selectors());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_all_legacy_aliases: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_legacy_aliases());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_item_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_item_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_item: async (data) => {
        const client = await postgres.connect();
        try {
            const payload = normalizeItemPayload(data);
            const ret = await client.query(models.create_item(), [
                payload.legacy_item_id,
                payload.name,
                payload.unit_price,
                payload.default_quantity,
                payload.editable,
                payload.dynamic_by_students,
                payload.has_subitems,
                JSON.stringify(payload.subitems),
                JSON.stringify(payload.variations),
                payload.has_additional,
                payload.additional_quantity,
                payload.has_multiplier,
                payload.multiplier_quantity,
                payload.value_visible_to_client,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_item: async (id, data) => {
        const client = await postgres.connect();
        try {
            const payload = normalizeItemPayload(data);
            const ret = await client.query(models.update_item(), [
                payload.legacy_item_id,
                payload.name,
                payload.unit_price,
                payload.default_quantity,
                payload.editable,
                payload.dynamic_by_students,
                payload.has_subitems,
                JSON.stringify(payload.subitems),
                JSON.stringify(payload.variations),
                payload.has_additional,
                payload.additional_quantity,
                payload.has_multiplier,
                payload.multiplier_quantity,
                payload.value_visible_to_client,
                id,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_item: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_item(), [id]);
        } finally { client.release(); }
    },

    // ---- SUB-ITEMS ----
    execute_get_all_sub_items: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_sub_items());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_sub_item_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_sub_item_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_sub_item: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_sub_item(), [data.name]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_sub_item: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_sub_item(), [data.name, id]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_sub_item: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_sub_item(), [id]);
        } finally { client.release(); }
    },

    // ---- EVENT TEMPLATES ----

    execute_get_all_event_templates: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_event_templates());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_event_template_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_event_template_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_get_event_template_runtime_catalog: async () => {
        const [items, selectors, eventTemplates, legacyAliases] = await Promise.all([
            execute.execute_get_all_items(),
            execute.execute_get_all_catalog_selectors(),
            execute.execute_get_all_event_templates(),
            execute.execute_get_all_legacy_aliases(),
        ]);

        return {
            items,
            selectors,
            eventTemplates,
            legacyAliases,
        };
    },

    execute_create_event_template: async (data) => {
        const client = await postgres.connect();
        try {
            const payload = normalizeEventTemplatePayload(data);
            await client.query('BEGIN');
            const ret = await client.query(models.create_event_template(), [
                payload.legacy_event_id, payload.name, payload.city, payload.type, payload.value, payload.has_administration, payload.unit_price_editable, payload.requires_min_events,
                payload.closes_summary_block, payload.summary_block_label,
                // Sem família informada → evento novo abre a própria família.
                payload.group_id || require('crypto').randomUUID(),
            ]);
            const template = ret.rows[0];

            for (const itemId of payload.item_ids) {
                await client.query(models.insert_event_template_item(), [template.id, itemId]);
            }
            for (const cfg of payload.event_item_configs) {
                await client.query(models.insert_event_template_item_config(), [
                    template.id,
                    cfg.item_id,
                    cfg.sort_order,
                    cfg.is_group_header,
                    cfg.group_title,
                    cfg.display_value,
                    cfg.fixed_qty,
                    cfg.quantity_editable,
                    cfg.price_editable,
                    cfg.dynamic_by_students,
                    cfg.derived_rule_mode,
                    cfg.derived_rule_value,
                ]);
            }

            await client.query('COMMIT');
            return await execute.execute_get_event_template_by_id(payload.legacy_event_id || String(template.id));
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    },

    // Clona o evento para outra cidade dentro da mesma família (group_id):
    // copia itens, TODAS as colunas de config e as regras de resumo.
    execute_clone_event_template: async (sourceId, { city, name, newFamily } = {}) => {
        const client = await postgres.connect();
        try {
            await client.query('BEGIN');
            const src = await client.query(models.ensure_event_template_group(), [String(sourceId)]);
            const source = src.rows[0];
            if (!source) {
                await client.query('ROLLBACK');
                return null;
            }
            const created = await client.query(models.clone_event_template(), [
                source.id,
                typeof name === 'string' && name.trim() ? name.trim() : null,
                city,
                // Duplicar = evento separado (família própria); nova cidade = mesma família.
                newFamily ? require('crypto').randomUUID() : null,
            ]);
            const template = created.rows[0];
            await client.query(models.clone_event_template_items(), [source.id, template.id]);
            await client.query(models.clone_event_template_item_configs(), [source.id, template.id]);
            await client.query(models.clone_event_template_summary_rules(), [source.id, template.id]);
            await client.query('COMMIT');
            return await execute.execute_get_event_template_by_id(String(template.id));
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    },

    // "Aplicar às outras cidades": sobrescreve os irmãos da família com a config
    // do evento de origem (campos, itens, configs e regras). Cidade preservada.
    execute_apply_event_template_to_family: async (sourceId) => {
        const client = await postgres.connect();
        try {
            await client.query('BEGIN');
            const src = await client.query(models.ensure_event_template_group(), [String(sourceId)]);
            const source = src.rows[0];
            if (!source) {
                await client.query('ROLLBACK');
                return null;
            }
            const siblings = await client.query(models.get_event_template_siblings(), [source.id]);
            for (const sib of siblings.rows) {
                await client.query(models.sync_event_template_from_source(), [source.id, sib.id]);
                await client.query(models.delete_event_template_items(), [sib.id]);
                await client.query(models.delete_event_template_item_configs(), [sib.id]);
                await client.query(models.delete_event_template_summary_rules(), [sib.id]);
                await client.query(models.clone_event_template_items(), [source.id, sib.id]);
                await client.query(models.clone_event_template_item_configs(), [source.id, sib.id]);
                await client.query(models.clone_event_template_summary_rules(), [source.id, sib.id]);
            }
            await client.query('COMMIT');
            return { applied_to: siblings.rows.map((s) => s.city) };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    },

    execute_update_event_template: async (id, data) => {
        const client = await postgres.connect();
        try {
            const payload = normalizeEventTemplatePayload(data);
            await client.query('BEGIN');
            const ret = await client.query(models.update_event_template(), [
                payload.name, payload.city, payload.type, payload.legacy_event_id, payload.value, payload.has_administration, payload.unit_price_editable, payload.requires_min_events,
                payload.closes_summary_block, payload.summary_block_label, id
            ]);
            const template = ret.rows[0];

            await client.query(models.delete_event_template_items(), [template.id]);
            for (const itemId of payload.item_ids) {
                await client.query(models.insert_event_template_item(), [template.id, itemId]);
            }

            if (payload.event_item_configs.length > 0) {
                // Payload traz configs (importação/seed): reconstrói por completo.
                await client.query(models.delete_event_template_item_configs(), [template.id]);
                for (const cfg of payload.event_item_configs) {
                    await client.query(models.insert_event_template_item_config(), [
                        template.id,
                        cfg.item_id,
                        cfg.sort_order,
                        cfg.is_group_header,
                        cfg.group_title,
                        cfg.display_value,
                        cfg.fixed_qty,
                        cfg.quantity_editable,
                        cfg.price_editable,
                        cfg.dynamic_by_students,
                        cfg.derived_rule_mode,
                        cfg.derived_rule_value,
                    ]);
                }
            } else {
                // UI não envia configs: preserva os existentes (sort_order, headers,
                // regras) e remove apenas os configs de itens removidos do evento.
                const itemIds = payload.item_ids.map(Number).filter(Number.isFinite);
                await client.query(models.prune_event_template_item_configs(), [template.id, itemIds]);
            }

            await client.query('COMMIT');
            return await execute.execute_get_event_template_by_id(payload.legacy_event_id || String(template.id));
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    },

    execute_delete_event_template: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_event_template(), [id]);
        } finally { client.release(); }
    },

    // ---- AUDITORIUMS ----
    execute_get_all_auditoriums: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_auditoriums());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_auditorium_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_auditorium_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_auditorium: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_auditorium(), [
                data.name, data.slug, data.price, Boolean(data.allow_budget_edit), data.city,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_auditorium: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_auditorium(), [
                data.name, data.slug, data.price, Boolean(data.allow_budget_edit), data.city, id,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_auditorium: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_auditorium(), [id]);
        } finally { client.release(); }
    },

    // ---- CONTRACTS ----
    execute_get_all_contracts: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_contracts());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_contract_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_contract_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_contract: async (data, user) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_contract(), [
                data.title,
                JSON.stringify(data.variables || {}),
                user?.id || null,
                user?.name || null,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_contract: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_contract(), [
                data.title,
                JSON.stringify(data.variables || {}),
                id,
            ]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_delete_contract: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_contract(), [id]);
        } finally { client.release(); }
    },

    // ---- CONTRACT ANNEXES ----
    execute_get_all_contract_annexes: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_contract_annexes());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_contract_annex_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_contract_annex_by_id(), [String(id)]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_get_contract_annex_by_budget: async (budgetId, budgetCode) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_contract_annex_by_budget(), [budgetId, budgetCode || null]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_contract_annex: async (data, user) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_contract_annex(), [
                data.budget_id,
                data.budget_code || null,
                data.title || '',
                data.signature_date || null,
                JSON.stringify(data.signature_names || []),
                JSON.stringify(data.courtesy_event_ids || []),
                user?.id || null,
                user?.name || null,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_contract_annex: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_contract_annex(), [
                data.budget_id || null,
                data.title || '',
                data.signature_date || null,
                JSON.stringify(data.signature_names || []),
                JSON.stringify(data.courtesy_event_ids || []),
                String(id),
            ]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_delete_contract_annex: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_contract_annex(), [String(id)]);
        } finally { client.release(); }
    },

    // ---- CITIES ----
    execute_get_all_cities: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_all_cities());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_city_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_city_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_city: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_city(), [data.name]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_city: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_city(), [data.name, id]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    // Exclui a cidade e, junto, os eventos base atrelados a ela (senão ficavam
    // órfãos e continuavam aparecendo como aba do evento).
    execute_delete_city: async (id, cityName) => {
        const client = await postgres.connect();
        try {
            await client.query('BEGIN');
            let deletedEvents = 0;
            if (cityName) {
                const ret = await client.query(models.delete_event_templates_by_city(), [cityName]);
                deletedEvents = ret.rowCount || 0;
            }
            await client.query(models.delete_city(), [id]);
            await client.query('COMMIT');
            return { deleted_events: deletedEvents };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
    },

    // ---- BUDGET REVIEWS (devolutivas) ----
    execute_get_budget_reviews: async (budgetId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_budget_reviews(), [budgetId]);
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_budget_owner: async (budgetId) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_budget_owner(), [budgetId]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_budget_review: async (data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.create_budget_review(), [
                data.budget_id,
                data.author_user_id,
                data.author_name,
                data.author_role,
                data.kind,
                data.message,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    // ---- PROPOSTAS DE LOCACAO (Aurora Hall) ----
    execute_get_venue_proposals: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_venue_proposals());
            return ret.rows;
        } finally { client.release(); }
    },

    execute_get_venue_proposal_by_id: async (id) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_venue_proposal_by_id(), [id]);
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_create_venue_proposal: async (data) => {
        const client = await postgres.connect();
        try {
            // O codigo nasce aqui para poder servir tambem de codigo da
            // familia quando a proposta e a primeira versao.
            const proposalCode = data.proposalCode || _generateProposalCode();
            const ret = await client.query(models.create_venue_proposal(), [
                proposalCode,
                data.clientName || '', data.eventType || '',
                _numeroOuNulo(data.guests), _dataOuNulo(data.eventDate),
                data.eventTime || null,
                Number(data.setupDays) || 0, Number(data.teardownDays) || 0,
                data.entranceId || '', JSON.stringify(data.data || {}),
                Number(data.subtotal) || 0,
                _discountMode(data.discountMode),
                Number(data.discountPercent) || 0,
                Number(data.discountAmount) || 0,
                data.discountReason || null,
                _discountStatus(data.discountStatus),
                Number(data.totalValue) || 0,
                _dataOuNulo(data.validUntil),
                data.status || 'PENDING', data.observation || null,
                data.createdByUserId || null, data.createdByName || null,
                _dataOuNulo(data.eventEndDate) || _dataOuNulo(data.eventDate),
                data.familyCode || proposalCode,
                _numeroOuNulo(data.version) || 1,
                _numeroOuNulo(data.parentId),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_update_venue_proposal: async (id, data) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_venue_proposal(), [
                data.clientName || '', data.eventType || '',
                _numeroOuNulo(data.guests), _dataOuNulo(data.eventDate),
                data.eventTime || null,
                Number(data.setupDays) || 0, Number(data.teardownDays) || 0,
                data.entranceId || '', JSON.stringify(data.data || {}),
                Number(data.subtotal) || 0,
                _discountMode(data.discountMode),
                Number(data.discountPercent) || 0,
                Number(data.discountAmount) || 0,
                data.discountReason || null,
                _discountStatus(data.discountStatus),
                Number(data.totalValue) || 0,
                _dataOuNulo(data.validUntil),
                data.status || 'PENDING', data.observation || null,
                id,
                _dataOuNulo(data.eventEndDate) || _dataOuNulo(data.eventDate),
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_review_venue_proposal_discount: async (id, status, reviewedBy, observation, valores) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.review_venue_proposal_discount(), [
                status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
                reviewedBy || null, observation || null,
                Number(valores?.discountPercent) || 0,
                Number(valores?.discountAmount) || 0,
                Number(valores?.totalValue) || 0,
                id,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    /**
     * Cria a proxima versao de uma proposta.
     *
     * A versao anterior fica intacta: e documento ja enviado ao cliente. O
     * numero vem do maior ja gravado na familia, e nao de um contador no
     * cliente, para duas edicoes simultaneas nao nascerem com o mesmo numero.
     */
    execute_create_venue_proposal_version: async (parentId, data) => {
        const client = await postgres.connect();
        try {
            const anterior = await client.query(models.get_venue_proposal_by_id(), [parentId]);
            const pai = anterior.rows[0];
            if (!pai) return null;

            const familia = pai.family_code || pai.proposal_code;
            const ultima = await client.query(models.get_venue_family_last_version(), [familia]);
            const proxima = Number(ultima.rows[0]?.last_version || 0) + 1;

            return await execute.execute_create_venue_proposal({
                ...data,
                familyCode: familia,
                version: proxima,
                parentId,
                // Versao nova nasce pendente: e um documento novo a decidir.
                status: 'PENDING',
                discountStatus: data.discountStatus,
            });
        } finally { client.release(); }
    },

    execute_update_venue_proposal_status: async (id, status, observation, approvedBy) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_venue_proposal_status(), [
                _venueStatus(status), observation || null, approvedBy || null, id,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },

    execute_delete_venue_proposal: async (id) => {
        const client = await postgres.connect();
        try {
            await client.query(models.delete_venue_proposal(), [id]);
        } finally { client.release(); }
    },

    execute_get_venue_settings: async () => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.get_venue_settings());
            return ret.rows[0] || null;
        } finally { client.release(); }
    },

    execute_update_venue_settings: async (data, updatedByName) => {
        const client = await postgres.connect();
        try {
            const ret = await client.query(models.update_venue_settings(), [
                JSON.stringify(data || {}), updatedByName || null,
            ]);
            return ret.rows[0];
        } finally { client.release(); }
    },
};

module.exports = execute;
