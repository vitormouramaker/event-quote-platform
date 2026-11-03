const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Anexo contratual e exclusivo de administradores (gerar, ver, editar).
function isAdminUser(user) {
    return user?.role === 'ADM_MASTER' || user?.role === 'ADM_GERENTE';
}

function normalizeAnnexPayload(body = {}) {
    const names = Array.isArray(body.signature_names) ? body.signature_names : [];
    // Eventos cortesia existem so no anexo: nao tocam no orcamento atrelado.
    const courtesy = Array.isArray(body.courtesy_event_ids) ? body.courtesy_event_ids : [];
    return {
        budget_id: typeof body.budget_id === 'string' && body.budget_id.trim() ? body.budget_id.trim() : null,
        budget_code: typeof body.budget_code === 'string' && body.budget_code.trim() ? body.budget_code.trim() : null,
        title: typeof body.title === 'string' ? body.title.trim() : '',
        signature_date: typeof body.signature_date === 'string' && body.signature_date.trim()
            ? body.signature_date.trim()
            : null,
        signature_names: names.map((name) => (name == null ? '' : String(name))),
        courtesy_event_ids: courtesy
            .filter((id) => id != null && String(id).trim())
            .map((id) => String(id).trim()),
    };
}

// GET /web/contract-annexes
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        if (!isAdminUser(req.user)) return security.deny(res, 'Apenas administradores acessam anexos contratuais');
        const rows = await execute.execute_get_all_contract_annexes();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/contract-annexes GET'));
    }
});

// GET /web/contract-annexes/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!isAdminUser(req.user)) return security.deny(res, 'Apenas administradores acessam anexos contratuais');
        const annex = await execute.execute_get_contract_annex_by_id(req.params.id);
        if (!annex) return res.json(utils.jsonMount(false, {}, 'Anexo não encontrado'));
        return res.json(utils.jsonMount(true, annex, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contract-annexes GET ${req.params.id}`));
    }
});

// POST /web/contract-annexes — so para orcamento APROVADO, um por familia.
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        if (!isAdminUser(req.user)) return security.deny(res, 'Apenas administradores geram anexos contratuais');
        const data = normalizeAnnexPayload(req.body);
        if (!data.budget_id) return res.json(utils.jsonMount(false, {}, 'budget_id obrigatório'));

        const budget = await execute.execute_get_budget_by_id(data.budget_id);
        if (!budget) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (budget.status !== 'APPROVED') {
            return res.json(utils.jsonMount(false, {}, 'O anexo só pode ser gerado para orçamentos aprovados.'));
        }

        // Um anexo por orcamento/familia: se ja existe, devolve o existente.
        const existing = await execute.execute_get_contract_annex_by_budget(
            data.budget_id,
            data.budget_code || budget.budget_code,
        );
        if (existing) {
            const full = await execute.execute_get_contract_annex_by_id(existing.id);
            return res.json(utils.jsonMount(true, full, 'Este orçamento já possui anexo contratual.'));
        }

        const annex = await execute.execute_create_contract_annex(
            { ...data, budget_code: data.budget_code || budget.budget_code || null },
            req.user,
        );
        attachAudit(req, {
            action: 'contract_annex.create',
            entity_type: 'contract_annex',
            entity_id: annex?.id,
            description: 'Geração de anexo contratual',
            after_data: annex || null,
        });
        return res.json(utils.jsonMount(true, annex, 'Anexo contratual gerado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/contract-annexes POST'));
    }
});

// PUT /web/contract-annexes/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!isAdminUser(req.user)) return security.deny(res, 'Apenas administradores editam anexos contratuais');
        const before = await execute.execute_get_contract_annex_by_id(req.params.id);
        if (!before) return res.json(utils.jsonMount(false, {}, 'Anexo não encontrado'));

        const data = normalizeAnnexPayload(req.body);
        const annex = await execute.execute_update_contract_annex(req.params.id, data);
        attachAudit(req, {
            action: 'contract_annex.update',
            entity_type: 'contract_annex',
            entity_id: req.params.id,
            description: 'Atualização de anexo contratual',
            before_data: before || null,
            after_data: annex || null,
        });
        return res.json(utils.jsonMount(true, annex, 'Anexo atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contract-annexes PUT ${req.params.id}`));
    }
});

// DELETE /web/contract-annexes/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!isAdminUser(req.user)) return security.deny(res, 'Apenas administradores excluem anexos contratuais');
        const before = await execute.execute_get_contract_annex_by_id(req.params.id);
        if (!before) return res.json(utils.jsonMount(false, {}, 'Anexo não encontrado'));

        await execute.execute_delete_contract_annex(req.params.id);
        attachAudit(req, {
            action: 'contract_annex.delete',
            entity_type: 'contract_annex',
            entity_id: req.params.id,
            description: 'Exclusão de anexo contratual',
            before_data: before || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Anexo excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contract-annexes DELETE ${req.params.id}`));
    }
});

module.exports = rota;
