const express  = require('express');
const rota     = express.Router();
const execute  = require('../services/execute_web');
const security = require('../security/auth');
const utils    = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// GET /web/budgets
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        attachAudit(req, { action: 'budget.list', entity_type: 'budget', description: 'Listagem de orcamentos' });
        const { id: userId } = req.user;
        let rows;
        if (security.canViewAllBudgets(req.user)) {
            rows = await execute.execute_get_all_budgets();
        } else {
            rows = await execute.execute_get_budgets_by_user(userId);
        }
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/budgets GET'));
    }
});

// GET /web/budgets/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        const budget = await execute.execute_get_budget_by_id(req.params.id);
        attachAudit(req, {
            action: 'budget.view',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Visualizacao de orcamento',
            after_data: budget || null,
        });
        if (!budget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, budget)) {
            return security.deny(res, 'Você não pode visualizar este orçamento');
        }
        return res.json(utils.jsonMount(true, budget, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets GET ${req.params.id}`));
    }
});

// POST /web/budgets — raw JSON body
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canCreateBudget(req.user)) {
            return security.deny(res, 'Você não pode criar orçamentos');
        }
        const data = req.body;
        data.createdByUserId = req.user.id;
        data.createdByName   = req.user.name;
        const budget = await execute.execute_create_budget(data);
        attachAudit(req, {
            action: 'budget.create',
            entity_type: 'budget',
            entity_id: budget?.id,
            description: 'Criacao de orcamento',
            after_data: budget || null,
        });
        return res.json(utils.jsonMount(true, budget, 'Orçamento criado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/budgets POST'));
    }
});

// PUT /web/budgets/:id — raw JSON body
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        const beforeBudget = await execute.execute_get_budget_by_id(req.params.id);
        if (!beforeBudget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, beforeBudget) || !security.canEditBudget(req.user)) {
            return security.deny(res, 'Você não pode editar este orçamento');
        }
        const budget = await execute.execute_update_budget(req.params.id, req.body);
        attachAudit(req, {
            action: 'budget.update',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Atualizacao de orcamento',
            before_data: beforeBudget || null,
            after_data: budget || null,
        });
        return res.json(utils.jsonMount(true, budget, 'Orçamento atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets PUT ${req.params.id}`));
    }
});

// PATCH /web/budgets/:id/lock
rota.patch('/:id/lock', security.authMiddleware, async (req, res) => {
    try {
        const beforeBudget = await execute.execute_get_budget_by_id(req.params.id);
        if (!beforeBudget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, beforeBudget) || !security.canEditBudget(req.user)) {
            return security.deny(res, 'Você não pode alterar este orçamento');
        }
        const result = await execute.execute_update_budget_lock(req.params.id, req.body.isLocked);
        const afterBudget = await execute.execute_get_budget_by_id(req.params.id);
        attachAudit(req, {
            action: 'budget.lock_update',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Alteracao de bloqueio do orcamento',
            before_data: beforeBudget || null,
            after_data: afterBudget || result || null,
            metadata: { isLocked: Boolean(req.body.isLocked) },
        });
        return res.json(utils.jsonMount(true, result, 'Bloqueio atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets PATCH lock ${req.params.id}`));
    }
});

// PATCH /web/budgets/:id/status
rota.patch('/:id/status', security.authMiddleware, async (req, res) => {
    try {
        const beforeBudget = await execute.execute_get_budget_by_id(req.params.id);
        if (!beforeBudget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, beforeBudget) || !security.canEditBudget(req.user)) {
            return security.deny(res, 'Você não pode alterar o status deste orçamento');
        }
        const result = await execute.execute_update_budget_status(
            req.params.id, req.body.status, req.body.observation
        );
        const afterBudget = await execute.execute_get_budget_by_id(req.params.id);
        attachAudit(req, {
            action: 'budget.status_update',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Alteracao de status do orcamento',
            before_data: beforeBudget || null,
            after_data: afterBudget || result || null,
            metadata: {
                previousStatus: beforeBudget?.status || null,
                nextStatus: req.body.status || null,
            },
        });
        return res.json(utils.jsonMount(true, result, 'Status atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets PATCH status ${req.params.id}`));
    }
});

// PATCH /web/budgets/:id/archive — somente admin
rota.patch('/:id/archive', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canArchiveBudget(req.user)) {
            return security.deny(res, 'Apenas administradores podem arquivar orçamentos');
        }
        const beforeBudget = await execute.execute_get_budget_by_id(req.params.id);
        if (!beforeBudget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));

        const archive = req.body?.archived === true || req.body?.archive === true;
        const result = archive
            ? await execute.execute_archive_budget(req.params.id, req.user.id, req.user.name)
            : await execute.execute_unarchive_budget(req.params.id);
        const afterBudget = await execute.execute_get_budget_by_id(req.params.id);
        attachAudit(req, {
            action: archive ? 'budget.archive' : 'budget.unarchive',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: archive ? 'Arquivamento de orcamento' : 'Desarquivamento de orcamento',
            before_data: beforeBudget || null,
            after_data: afterBudget || result || null,
        });
        return res.json(utils.jsonMount(true, result, archive ? 'Orçamento arquivado!' : 'Orçamento desarquivado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets PATCH archive ${req.params.id}`));
    }
});

// DELETE /web/budgets/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        const beforeBudget = await execute.execute_get_budget_by_id(req.params.id);
        if (!beforeBudget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, beforeBudget) || !security.canDeleteBudget(req.user)) {
            return security.deny(res, 'Você não pode excluir este orçamento');
        }
        await execute.execute_delete_budget(req.params.id);
        attachAudit(req, {
            action: 'budget.delete',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Exclusao de orcamento',
            before_data: beforeBudget || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Orçamento excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets DELETE ${req.params.id}`));
    }
});

// POST /web/budgets/:id/share — gera/retorna o token do demonstrativo público.
rota.post('/:id/share', security.authMiddleware, async (req, res) => {
    try {
        const budget = await execute.execute_get_budget_by_id(req.params.id);
        if (!budget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, budget)) {
            return security.deny(res, 'Você não pode compartilhar este orçamento');
        }
        const token = await execute.execute_set_budget_share_token(req.params.id);
        attachAudit(req, {
            action: 'budget.share',
            entity_type: 'budget',
            entity_id: req.params.id,
            description: 'Geracao de link do demonstrativo',
        });
        return res.json(utils.jsonMount(true, { token }, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budgets POST ${req.params.id}/share`));
    }
});

module.exports = rota;
