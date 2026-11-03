const express = require('express');
const rota = express.Router();
const execute = require('../services/execute_web');
const security = require('../security/auth');
const utils = require('../utils/templates');

// GET /web/dashboard/summary
rota.get('/summary', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canViewDashboard(req.user)) {
            return security.deny(res, 'Você não pode acessar o dashboard');
        }
        const summary = await execute.execute_get_dashboard_summary(req.user, {
            preset: req.query.preset,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            status: req.query.status,
            archived: req.query.archived,
            seller: req.query.seller,
        });
        return res.json(utils.jsonMount(true, summary, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/dashboard/summary GET'));
    }
});

module.exports = rota;
