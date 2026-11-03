const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

// A proposta de locacao do Aurora Hall e um produto comercial proprio: quem
// monta e o mesmo perfil que monta orcamento (consultor e gestor).
function canManageProposals(user) {
    return security.isAdmin(user) || security.canCreateBudget(user);
}

// Aprovar desconto e decisao de gestor, como no orcamento.
function canApproveDiscount(user) {
    return security.isAdmin(user) || user?.perm_approve_discounts === true;
}

// GET /web/venue-proposals/settings  (antes de /:id, senao o Express casa "settings" como id)
rota.get('/settings', security.authMiddleware, async (req, res) => {
    try {
        const row = await execute.execute_get_venue_settings();
        return res.json(utils.jsonMount(true, row, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals/settings GET'));
    }
});

// PUT /web/venue-proposals/settings — tabela de precos do espaco
rota.put('/settings', security.authMiddleware, async (req, res) => {
    try {
        if (!security.isAdmin(req.user)) {
            return security.deny(res, 'Somente o gestor altera a tabela de precos');
        }
        const row = await execute.execute_update_venue_settings(req.body?.data, req.user.name);
        attachAudit(req, {
            action: 'venue_settings.update',
            entity_type: 'venue_settings',
            entity_id: '1',
            description: 'Tabela de precos do Aurora Hall atualizada',
            after_data: row || null,
        });
        return res.json(utils.jsonMount(true, row, 'Tabela de precos atualizada!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals/settings PUT'));
    }
});

// GET /web/venue-proposals
rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode acessar propostas de locacao');
        }
        const rows = await execute.execute_get_venue_proposals();
        return res.json(utils.jsonMount(true, rows, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals GET'));
    }
});

// GET /web/venue-proposals/:id
rota.get('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode acessar propostas de locacao');
        }
        const row = await execute.execute_get_venue_proposal_by_id(req.params.id);
        if (!row) return res.json(utils.jsonMount(false, {}, 'Proposta nao encontrada'));
        return res.json(utils.jsonMount(true, row, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals/:id GET'));
    }
});

// POST /web/venue-proposals
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode criar propostas de locacao');
        }
        const data = { ...req.body };
        data.createdByUserId = req.user.id;
        data.createdByName = req.user.name;
        const row = await execute.execute_create_venue_proposal(data);
        attachAudit(req, {
            action: 'venue_proposal.create',
            entity_type: 'venue_proposal',
            entity_id: row ? String(row.id) : null,
            description: `Proposta de locacao criada para ${data.clientName || 'cliente'}`,
            after_data: row || null,
        });
        return res.json(utils.jsonMount(true, row, 'Proposta criada!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals POST'));
    }
});

// PUT /web/venue-proposals/:id
rota.put('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode editar propostas de locacao');
        }
        const row = await execute.execute_update_venue_proposal(req.params.id, req.body);
        attachAudit(req, {
            action: 'venue_proposal.update',
            entity_type: 'venue_proposal',
            entity_id: req.params.id,
            description: 'Proposta de locacao atualizada',
            after_data: row || null,
        });
        if (!row) return res.json(utils.jsonMount(false, {}, 'Proposta nao encontrada'));
        return res.json(utils.jsonMount(true, row, 'Proposta atualizada!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals/:id PUT'));
    }
});

// PATCH /web/venue-proposals/:id/discount — aprova ou rejeita o desconto pedido
rota.patch('/:id/discount', security.authMiddleware, async (req, res) => {
    try {
        if (!canApproveDiscount(req.user)) {
            return security.deny(res, 'Voce nao pode aprovar descontos');
        }
        const { status, observation, discountPercent, discountAmount, totalValue } = req.body || {};
        if (status !== 'APPROVED' && status !== 'REJECTED') {
            return res.json(utils.jsonMount(false, {}, 'Decisao invalida: use aprovar ou rejeitar'));
        }
        const row = await execute.execute_review_venue_proposal_discount(
            req.params.id, status, req.user.name, observation,
            { discountPercent, discountAmount, totalValue },
        );
        attachAudit(req, {
            action: status === 'APPROVED' ? 'venue_proposal.discount_approve' : 'venue_proposal.discount_reject',
            entity_type: 'venue_proposal',
            entity_id: req.params.id,
            description: 'Desconto da proposta de locacao revisado',
            after_data: row || null,
        });
        if (!row) {
            return res.json(utils.jsonMount(
                false, {}, `Proposta ${req.params.id} nao encontrada para revisar o desconto`,
            ));
        }
        return res.json(utils.jsonMount(
            true, row, status === 'APPROVED' ? 'Desconto aprovado!' : 'Desconto rejeitado.',
        ));
    } catch (error) {
        // `errorHandle` devolve uma mensagem generica ao cliente; o detalhe do
        // que falhou so existe aqui, no log do container.
        console.error('[venue_proposal.discount] falhou', {
            id: req.params.id,
            status: req.body?.status,
            usuario: req.user?.name,
            erro: error?.message || String(error),
            stack: error?.stack,
        });
        return res.json(utils.errorHandle(error, '/venue-proposals/:id/discount PATCH'));
    }
});

// POST /web/venue-proposals/:id/versions — cria a proxima versao da proposta
rota.post('/:id/versions', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode versionar propostas de locacao');
        }
        const data = { ...req.body };
        data.createdByUserId = req.user.id;
        data.createdByName = req.user.name;
        const row = await execute.execute_create_venue_proposal_version(req.params.id, data);
        if (!row) {
            return res.json(utils.jsonMount(
                false, {}, `Proposta ${req.params.id} nao encontrada`,
            ));
        }
        attachAudit(req, {
            action: 'venue_proposal.version_create',
            entity_type: 'venue_proposal',
            entity_id: String(row.id),
            description: `Nova versao da proposta ${row.proposal_code}`,
            after_data: row,
        });
        return res.json(utils.jsonMount(true, row, `Versao ${row.version} criada!`));
    } catch (error) {
        console.error('[venue_proposal.version] falhou', {
            id: req.params.id,
            usuario: req.user?.name,
            erro: error?.message || String(error),
            stack: error?.stack,
        });
        return res.json(utils.errorHandle(error, '/venue-proposals/:id/versions POST'));
    }
});

// PATCH /web/venue-proposals/:id/status — manda para aprovacao, aprova, devolve
rota.patch('/:id/status', security.authMiddleware, async (req, res) => {
    try {
        if (!canManageProposals(req.user)) {
            return security.deny(res, 'Voce nao pode alterar o status desta proposta');
        }
        const { status, observation } = req.body || {};
        const alvo = String(status || '').toUpperCase();
        if (!['PENDING', 'SENT_FOR_APPROVAL', 'APPROVED', 'CANCELLED'].includes(alvo)) {
            return res.json(utils.jsonMount(false, {}, 'Status invalido'));
        }
        // Aprovar e cancelar sao decisoes do gestor; o consultor so manda para
        // aprovacao e volta para pendente.
        if (!security.isAdmin(req.user) && (alvo === 'APPROVED' || alvo === 'CANCELLED')) {
            return security.deny(res, 'Somente o gestor aprova ou cancela uma proposta');
        }
        const row = await execute.execute_update_venue_proposal_status(
            req.params.id, alvo, observation, req.user.name,
        );
        attachAudit(req, {
            action: `venue_proposal.status.${alvo.toLowerCase()}`,
            entity_type: 'venue_proposal',
            entity_id: req.params.id,
            description: `Status da proposta de locacao alterado para ${alvo}`,
            after_data: row || null,
        });
        if (!row) {
            return res.json(utils.jsonMount(
                false, {}, `Proposta ${req.params.id} nao encontrada`,
            ));
        }
        return res.json(utils.jsonMount(true, row, 'Status atualizado!'));
    } catch (error) {
        console.error('[venue_proposal.status] falhou', {
            id: req.params.id,
            status: req.body?.status,
            usuario: req.user?.name,
            erro: error?.message || String(error),
            stack: error?.stack,
        });
        return res.json(utils.errorHandle(error, '/venue-proposals/:id/status PATCH'));
    }
});

// DELETE /web/venue-proposals/:id
rota.delete('/:id', security.authMiddleware, async (req, res) => {
    try {
        if (!security.isAdmin(req.user)) {
            return security.deny(res, 'Somente o gestor exclui propostas de locacao');
        }
        await execute.execute_delete_venue_proposal(req.params.id);
        attachAudit(req, {
            action: 'venue_proposal.delete',
            entity_type: 'venue_proposal',
            entity_id: req.params.id,
            description: 'Proposta de locacao excluida',
        });
        return res.json(utils.jsonMount(true, {}, 'Proposta excluida!'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/venue-proposals/:id DELETE'));
    }
});

module.exports = rota;
