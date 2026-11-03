require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { auditTrailMiddleware } = require('./middleware/audit_trail');
const auditLogsService = require('./services/audit_logs');
const { runMigrations } = require('./server/connect');

const app = express();

let runtimePort = null;
let requestSequence = 0;

function logRuntime(level, event, meta = {}) {
    if (process.env.API_DEBUG !== '1') return;
    const payload = {
        ts: new Date().toISOString(),
        pid: process.pid,
        event,
        ...meta,
    };
    const line = `[api] ${JSON.stringify(payload)}`;

    if (level === 'error') return console.error(line);
    if (level === 'warn') return console.warn(line);
    return console.log(line);
}

function createRequestId() {
    requestSequence += 1;
    return `${Date.now().toString(36)}-${requestSequence.toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
}

// CORS so para os enderecos do front (lista em CORS_ORIGINS, separada por
// virgula). A autenticacao e por Bearer, sem cookie.
const CORS_ORIGINS = String(
    process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://localhost:4173',
)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
    origin: (origin, callback) => callback(null, !origin || CORS_ORIGINS.includes(origin)),
    exposedHeaders: ['X-Request-Id', 'X-Api-Port'],
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.set('trust proxy', 1);

// Request trace middleware (strategic diagnostics)
app.use((req, res, next) => {
    const requestId = createRequestId();
    const startNs = process.hrtime.bigint();
    const path = req.originalUrl || req.url;

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (runtimePort != null) {
        res.setHeader('X-Api-Port', String(runtimePort));
    }

    logRuntime('info', 'http.request.start', {
        requestId,
        method: req.method,
        path,
        ip: req.ip,
        port: runtimePort,
    });

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        logRuntime('info', 'http.request.finish', {
            requestId,
            method: req.method,
            path,
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            userId: req.user && req.user.id ? req.user.id : null,
            userRole: req.user && req.user.role ? req.user.role : null,
            port: runtimePort,
        });
    });

    res.on('close', () => {
        if (res.writableEnded) return;
        const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        logRuntime('warn', 'http.request.aborted', {
            requestId,
            method: req.method,
            path,
            durationMs: Math.round(durationMs * 100) / 100,
            port: runtimePort,
        });
    });

    next();
});

// Rotas públicas (sem auth e sem auditoria) — montadas antes do middleware de
// auditoria. Somente leitura, acesso via token aleatório.
const publicRoutes = require('./routes/public');
app.use('/public', publicRoutes);

// Anexos gravados localmente quando o Bunny.net nao esta configurado. Os nomes
// sao UUIDs; nada de listagem de pasta.
const storage = require('./services/bunny_storage');
if (!storage.bunnyEnabled()) {
    app.use('/uploads', express.static(storage.UPLOADS_DIR, { index: false, dotfiles: 'deny', fallthrough: false }));
}

app.use(auditTrailMiddleware);

// ---- Rotas ----
const auth = require('./routes/auth');
const users = require('./routes/users');
const budgets = require('./routes/budgets');
const items = require('./routes/items');
const eventTemplates = require('./routes/event_templates');
const subItems = require('./routes/sub_items');
const discount = require('./routes/discount_requests');
const editReq = require('./routes/edit_requests');
const dashboard = require('./routes/dashboard');
const logs = require('./routes/logs');
const auditoriums = require('./routes/auditoriums');
const cities = require('./routes/cities');
const budgetReviews = require('./routes/budget_reviews');
const contracts = require('./routes/contracts');
const contractAnnexes = require('./routes/contract_annexes');
const venueProposals = require('./routes/venue_proposals');

app.use('/web/auth', auth);
app.use('/web/users', users);
app.use('/web/budgets', budgets);
app.use('/web/items', items);
app.use('/web/event-templates', eventTemplates);
app.use('/web/sub-items', subItems);
app.use('/web/discounts', discount);
app.use('/web/edits', editReq);
app.use('/web/dashboard', dashboard);
app.use('/web/logs', logs);
app.use('/web/auditoriums', auditoriums);
app.use('/web/cities', cities);
app.use('/web/budget-reviews', budgetReviews);
app.use('/web/contracts', contracts);
app.use('/web/contract-annexes', contractAnnexes);
app.use('/web/venue-proposals', venueProposals);

// Healthcheck
app.get('/health', (_req, res) =>
    res.json({
        status: 'ok',
        ts: new Date().toISOString(),
        pid: process.pid,
        port: runtimePort,
        uptimeSec: Math.round(process.uptime()),
    })
);

// Express error logger (keeps default behavior, just logs)
app.use((err, req, _res, next) => {
    logRuntime('error', 'express.unhandled_error', {
        requestId: req && req.requestId ? req.requestId : null,
        method: req && req.method ? req.method : null,
        path: req && (req.originalUrl || req.url) ? (req.originalUrl || req.url) : null,
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : null,
        port: runtimePort,
    });
    next(err);
});

const DEFAULT_PORT = Number(process.env.PORT || 4444);
const MAX_PORT_ATTEMPTS = 6; // configured port + next 5

function startServer(preferredPort, attemptsRemaining = MAX_PORT_ATTEMPTS - 1) {
    const server = app.listen(preferredPort);

    server.once('listening', () => {
        const address = server.address();
        const runningPort = typeof address === 'object' && address ? address.port : preferredPort;
        runtimePort = runningPort;

        if (runningPort !== DEFAULT_PORT) {
            console.warn(`\x1b[33m[WARN] Porta ${DEFAULT_PORT} ocupada. Backend iniciado na porta ${runningPort}.\x1b[0m`);
        }
        console.log(`\x1b[32m[OK] Orça Eventos API rodando na porta ${runningPort}\x1b[0m`);
        logRuntime('info', 'server.listening', {
            requestedPort: preferredPort,
            runningPort,
            defaultPort: DEFAULT_PORT,
            cwd: process.cwd(),
            nodeEnv: process.env.NODE_ENV || null,
        });

        auditLogsService
            .ensureAuditLogsTable()
            .then(() => {
                logRuntime('info', 'audit.ensure_table.ok', { port: runtimePort });
            })
            .catch((err) => {
                console.error('[AUDIT] falha ao preparar tabela:', err.message || err);
                logRuntime('error', 'audit.ensure_table.fail', {
                    message: err && err.message ? err.message : String(err),
                    port: runtimePort,
                });
            });
    });

    server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && attemptsRemaining > 0) {
            const nextPort = Number(preferredPort) + 1;
            console.warn(`\x1b[33m[WARN] Porta ${preferredPort} em uso. Tentando ${nextPort}...\x1b[0m`);
            logRuntime('warn', 'server.port_in_use', {
                preferredPort,
                nextPort,
                attemptsRemaining,
            });
            return startServer(nextPort, attemptsRemaining - 1);
        }

        console.error('\x1b[31m[ERROR] Falha ao iniciar o backend:\x1b[0m', err && (err.message || err));
        logRuntime('error', 'server.start_failed', {
            preferredPort,
            code: err && err.code ? err.code : null,
            message: err && err.message ? err.message : String(err),
        });
        process.exit(1);
    });

    server.on('close', () => {
        logRuntime('warn', 'server.closed', { port: runtimePort });
    });

    return server;
}

process.on('unhandledRejection', (reason) => {
    logRuntime('error', 'process.unhandled_rejection', {
        message: reason && reason.message ? reason.message : String(reason),
        stack: reason && reason.stack ? reason.stack : null,
        port: runtimePort,
    });
});

process.on('uncaughtException', (error) => {
    logRuntime('error', 'process.uncaught_exception', {
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : null,
        port: runtimePort,
    });
});

['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach((signal) => {
    try {
        process.on(signal, () => {
            logRuntime('warn', 'process.signal', {
                signal,
                port: runtimePort,
            });
        });
    } catch {
        // Signal may not exist on this platform.
    }
});

process.on('exit', (code) => {
    logRuntime('warn', 'process.exit', {
        code,
        port: runtimePort,
    });
});

runMigrations()
    .then(() => startServer(DEFAULT_PORT))
    .catch((err) => {
        console.error('\x1b[31m[ERROR] Falha nas migrações:\x1b[0m', err && (err.message || err));
        process.exit(1);
    });
