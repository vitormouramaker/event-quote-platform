const express  = require('express');
const rota     = express.Router();
const execute  = require('../services/execute_web');
const security = require('../security/auth');
const utils    = require('../utils/templates');

async function accessibleBudget(user, budgetId) {
    if (!budgetId) return null;
    const budget = await execute.execute_get_budget_by_id(budgetId);
    return budget && security.canAccessBudget(user, budget) ? budget : null;
}

// GET /web/edits
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        let rows = await execute.execute_get_edit_requests();
        if (!security.canApproveEditRequests(req.user) && !security.canViewAllBudgets(req.user)) {
            const own = await execute.execute_get_budgets_by_user(req.user.id);
            const ids = new Set(own.map((b) => String(b.id)));
            rows = rows.filter((r) => ids.has(String(r.budget_id)));
        }
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/edits GET')); }
});

// GET /web/edits/budget/:budgetId
rota.get('/budget/:budgetId', security.authMiddleware, async (req, res) => {
    try {
        if (!(await accessibleBudget(req.user, req.params.budgetId))) {
            return security.deny(res, 'Você não pode ver este orçamento');
        }
        const rows = await execute.execute_get_edit_requests_by_budget(req.params.budgetId);
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) { return res.json(utils.errorHandle(error, '/edits/budget GET')); }
});

// POST /web/edits — raw JSON
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        if (!(await accessibleBudget(req.user, data.budgetId))) {
            return security.deny(res, 'Você não pode pedir edição deste orçamento');
        }

        // Verificar se já existe PENDING para este orçamento
        const existing = await execute.execute_get_edit_requests_by_budget(data.budgetId);
        const hasPending = existing.some(r => r.status === 'PENDING');
        if (hasPending) {
            return res.json(utils.jsonMount(false, {}, 'Já existe uma solicitação de edição pendente para este orçamento.'));
        }

        const row = await execute.execute_create_edit_request({
            ...data,
            requestedBy: req.user.name,
        });
        return res.json(utils.jsonMount(true, row, 'Solicitação de edição enviada!'));
    } catch (error) { return res.json(utils.errorHandle(error, '/edits POST')); }
});

// PATCH /web/edits/:id/status
rota.patch('/:id/status', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canApproveEditRequests(req.user)) {
            return security.deny(res, 'Você não pode aprovar pedidos de edição');
        }
        const { status, observation } = req.body;
        const row = await execute.execute_update_edit_request_status(
            req.params.id, status, req.user.name, observation
        );

        // Se aprovado, desbloquear o orçamento
        if (status === 'APPROVED' && row && row.budget_id) {
            await execute.execute_update_budget_lock(row.budget_id, false);
        }

        const msg = status === 'APPROVED'
            ? 'Edição aprovada! Orçamento desbloqueado.'
            : 'Edição rejeitada.';
        return res.json(utils.jsonMount(true, row, msg));
    } catch (error) { return res.json(utils.errorHandle(error, `/edits PATCH status`)); }
});

module.exports = rota;
