const express = require('express');
const rota = express.Router();
const security = require('../security/auth');
const utils = require('../utils/templates');
const auditLogs = require('../services/audit_logs');
const { attachAudit } = require('../middleware/audit_trail');

rota.get('/', security.authMiddleware, async (req, res) => {
    try {
        if (!security.canViewLogs(req.user)) {
            return security.deny(res, 'Você não pode acessar os logs');
        }
        attachAudit(req, {
            action: 'audit_logs.list',
            entity_type: 'audit_log',
            description: 'Consulta de trilha de auditoria',
        });

        const result = await auditLogs.listAuditLogs(req.query || {});
        return res.json(utils.jsonMount(true, result, 'OK'));
    } catch (error) {
        return res.json(utils.errorHandle(error, '/logs GET'));
    }
});

module.exports = rota;
