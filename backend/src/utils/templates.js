const security = require('../security/auth');

const utils = {
    jsonMount: (boll, data, msg) => {
        return { payload: security.jwtencript({ boleano: boll, obj: data, mensagem: msg }) };
    },

    errorHandle: (error, rota) => {
        console.log(`\x1b[31m✘ Erro na rota ${rota}:\x1b[0m`, error.message || error);
        return utils.jsonMount(false, {}, 'Tente novamente mais tarde!');
    },
};

module.exports = utils;
