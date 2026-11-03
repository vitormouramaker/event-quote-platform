const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');
const { attachAudit } = require('../middleware/audit_trail');

const KINDS = new Set(['devolutiva', 'resposta', 'aprovacao']);

function isAdmin(user) {
    return user?.role === 'ADM_MASTER' || user?.role === 'ADM_GERENTE';
}
function isAnalyst(user) {
    return user?.role === 'ADM_ANALISTA_ORCAMENTO';
}

// Status atual da análise derivado do último item do thread.
function deriveReviewStatus(reviews) {
    if (!reviews || reviews.length === 0) return 'NONE';
    const last = reviews[reviews.length - 1];
    if (last.kind === 'aprovacao') return 'APPROVED';
    if (last.kind === 'devolutiva') return 'PENDING_CREATOR';
    if (last.kind === 'resposta') return 'PENDING_ANALYST';
    return 'NONE';
}

// GET /web/budget-reviews/:budgetId — histórico completo (analista, criador, adm).
rota.get('/:budgetId', security.authMiddleware, async (req, res) => {
    try {
        const budget = await execute.execute_get_budget_by_id(req.params.budgetId);
        if (!budget || !security.canAccessBudget(req.user, budget)) {
            return security.deny(res, 'Você não pode ver este orçamento');
        }
        const reviews = await execute.execute_get_budget_reviews(req.params.budgetId);
        return res.json(
            utils.jsonMount(true, { reviews, status: deriveReviewStatus(reviews) }, 'OK'),
        );
    } catch (error) {
        return res.json(utils.errorHandle(error, `/budget-reviews GET ${req.params.budgetId}`));
    }
});

// POST /web/budget-reviews — adiciona devolutiva / resposta / aprovação.
rota.post('/', security.authMiddleware, async (req, res) => {
    try {
        const budgetId = typeof req.body?.budget_id === 'string' ? req.body.budget_id : '';
        const kind = typeof req.body?.kind === 'string' ? req.body.kind : '';
        const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

        if (!budgetId) return res.json(utils.jsonMount(false, {}, 'budget_id obrigatório'));
        if (!KINDS.has(kind)) return res.json(utils.jsonMount(false, {}, 'kind inválido'));

        const owner = await execute.execute_get_budget_owner(budgetId);
        if (!owner) return res.json(utils.jsonMount(false, {}, 'Orçamento não encontrado'));
        if (!security.canAccessBudget(req.user, owner)) {
            return security.deny(res, 'Você não pode ver este orçamento');
        }

        const reviews = await execute.execute_get_budget_reviews(budgetId);
        const status = deriveReviewStatus(reviews);

        const admin = isAdmin(req.user);
        const analyst = isAnalyst(req.user);
        const isOwner = owner.created_by_user_id && owner.created_by_user_id === String(req.user.id);

        if (status === 'APPROVED') {
            return res.json(utils.jsonMount(false, {}, 'Orçamento já aprovado pelo analista.'));
        }

        if (kind === 'devolutiva' || kind === 'aprovacao') {
            if (!analyst && !admin) {
                return res.json(utils.jsonMount(false, {}, 'Apenas o analista pode enviar devolutiva ou aprovar.'));
            }
            if (status === 'PENDING_CREATOR') {
                return res.json(utils.jsonMount(false, {}, 'Aguardando o criador informar que os pontos foram sanados.'));
            }
            if (kind === 'devolutiva' && !message) {
                return res.json(utils.jsonMount(false, {}, 'Descreva os pontos da devolutiva.'));
            }
        } else if (kind === 'resposta') {
            if (!isOwner && !admin) {
                return res.json(utils.jsonMount(false, {}, 'Apenas o criador do orçamento (ou um admin) pode responder.'));
            }
            if (status !== 'PENDING_CREATOR') {
                return res.json(utils.jsonMount(false, {}, 'Não há devolutiva pendente para responder.'));
            }
            if (!message) {
                return res.json(utils.jsonMount(false, {}, 'Descreva como os pontos foram sanados.'));
            }
        }

        const review = await execute.execute_create_budget_review({
            budget_id: budgetId,
            author_user_id: req.user.id,
            author_name: req.user.name,
            author_role: req.user.role,
            kind,
            message: message || null,
        });

        attachAudit(req, {
            action: `budget_review.${kind}`,
            entity_type: 'budget_review',
            entity_id: review?.id,
            description: `Devolutiva (${kind}) no orçamento`,
            after_data: review || null,
            metadata: { budget_id: budgetId },
        });

        const nextReviews = [...reviews, review];
        return res.json(
            utils.jsonMount(true, { review, status: deriveReviewStatus(nextReviews) }, 'Registrado com sucesso!'),
        );
    } catch (error) {
        return res.json(utils.errorHandle(error, '/budget-reviews POST'));
    }
});

module.exports = rota;
