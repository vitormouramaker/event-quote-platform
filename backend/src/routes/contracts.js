const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// Contratos: admin/gerente e quem cria orçamento (consultor). Analista não gera.
function canManageContracts(user) {
    const role = user?.role;
    if (role === 'ADM_MASTER' || role === 'ADM_GERENTE' || role === 'ADM_ORCAMENTO') return true;
    return security.canCreateBudget ? security.canCreateBudget(user) : false;
}

function normalizeContractPayload(body = {}) {
    const rawVars = body.variables && typeof body.variables === 'object' ? body.variables : {};
    const variables = {};
    for (const [key, value] of Object.entries(rawVars)) {
        variables[String(key)] = value == null ? '' : String(value);
    }
    return {
        title: typeof body.title === 'string' ? body.title.trim() : '',
        variables,
    };
}

// GET /web/contracts
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageContracts(req.user)) {
            return security.deny(res, 'Você não pode acessar contratos');
        }
        const rows = await execute.execute_get_all_contracts();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/contracts GET'));
    }
});

// GET /web/contracts/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageContracts(req.user)) {
            return security.deny(res, 'Você não pode acessar contratos');
        }
        const contract = await execute.execute_get_contract_by_id(req.params.id);
        if (!contract) {
            return res.json(utils.jsonMount(false, {}, 'Contrato não encontrado'));
        }
        return res.json(utils.jsonMount(true, contract, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contracts GET ${req.params.id}`));
    }
});

// POST /web/contracts
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageContracts(req.user)) {
            return security.deny(res, 'Você não pode criar contratos');
        }
        const data = normalizeContractPayload(req.body);
        const contract = await execute.execute_create_contract(data, req.user);
        attachAudit(req, {
            action: 'contract.create',
            entity_type: 'contract',
            entity_id: contract?.id,
            description: 'Criação de contrato',
            after_data: contract || null,
        });
        return res.json(utils.jsonMount(true, contract, 'Contrato salvo com sucesso!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/contracts POST'));
    }
});

// PUT /web/contracts/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageContracts(req.user)) {
            return security.deny(res, 'Você não pode editar contratos');
        }
        const before = await execute.execute_get_contract_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Contrato não encontrado'));
        }
        const data = normalizeContractPayload(req.body);
        const contract = await execute.execute_update_contract(req.params.id, data);
        attachAudit(req, {
            action: 'contract.update',
            entity_type: 'contract',
            entity_id: req.params.id,
            description: 'Atualização de contrato',
            before_data: before || null,
            after_data: contract || null,
        });
        return res.json(utils.jsonMount(true, contract, 'Contrato atualizado!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contracts PUT ${req.params.id}`));
    }
});

// DELETE /web/contracts/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageContracts(req.user)) {
            return security.deny(res, 'Você não pode excluir contratos');
        }
        const before = await execute.execute_get_contract_by_id(req.params.id);
        if (!before) {
            return res.json(utils.jsonMount(false, {}, 'Contrato não encontrado'));
        }
        await execute.execute_delete_contract(req.params.id);
        attachAudit(req, {
            action: 'contract.delete',
            entity_type: 'contract',
            entity_id: req.params.id,
            description: 'Exclusão de contrato',
            before_data: before || null,
        });
        return res.json(utils.jsonMount(true, {}, 'Contrato excluído!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, `/contracts DELETE ${req.params.id}`));
    }
});

module.exports = rota;
