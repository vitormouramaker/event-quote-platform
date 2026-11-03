// Teste de fumaca da API: login, permissoes e principais rotas.
//
//   npm run test:smoke                      (API em http://localhost:4444)
//   API=http://localhost:4650 npm run test:smoke
//
// Precisa da API rodando com as contas de demonstracao (npm run seed:demo) e o
// catalogo (npm run seed:catalog). Cria dados de teste com nomes unicos, entao
// pode rodar mais de uma vez no mesmo banco.
const BASE = process.env.API || 'http://localhost:4444';
const RUN = Date.now().toString(36);
const decode = (p) => JSON.parse(Buffer.from(p.split('.')[1], 'base64url').toString('utf8'));
let fails = 0;
function check(label, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails += 1;
}
async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const d = json.payload ? decode(json.payload) : json;
  return { status: res.status, ok: d.boleano, data: d.obj, msg: d.mensagem, raw: json };
}
async function login(l, p = 'Demo@2026') {
  const r = await call('POST', '/web/auth/login', null, { login: l, password: p });
  if (r.status === 429) {
    throw new Error('Limite de tentativas de login atingido (LOGIN_RATE_LIMIT). Reinicie a API ou aumente o limite.');
  }
  return r;
}

(async () => {
  const h = await fetch(BASE + '/health').then((r) => r.json());
  check('health', h.status === 'ok');

  const bad = await login('admin', 'errada');
  check('login com senha errada falha', bad.ok === false, bad.msg);

  const admin = await login('admin');
  check('login admin', admin.ok === true && !!admin.data.token, admin.msg);
  check('login nao devolve hash', admin.data && admin.data.password_hash === undefined);
  const consultor = await login('consultor');
  const gerente = await login('gerente');
  const analista = await login('analista');
  check('login consultor/gerente/analista', consultor.ok && gerente.ok && analista.ok);
  const A = admin.data.token, C = consultor.data.token, G = gerente.data.token, N = analista.data.token;

  const cat = await call('GET', '/web/event-templates/runtime-catalog', C);
  check('catalogo runtime', cat.ok && cat.data.eventTemplates.length > 0, `${cat.data?.eventTemplates?.length} eventos, ${cat.data?.items?.length} itens`);
  const cities = await call('GET', '/web/cities', C);
  check('cidades', cities.ok && cities.data.length >= 2, JSON.stringify(cities.data.map((c) => c.name)));
  const aud = await call('GET', '/web/auditoriums', C);
  check('auditorios', aud.ok && aud.data.length >= 2, JSON.stringify(aud.data.map((a) => `${a.name}:${a.price}`)));

  // Catalogo: consultor nao escreve, admin escreve.
  const cityC = await call('POST', '/web/cities', C, { name: 'Cidade Teste' });
  check('consultor NAO cria cidade', cityC.status === 403 && cityC.ok === false, cityC.msg);
  const cityA = await call('POST', '/web/cities', A, { name: `Cidade ${RUN}` });
  check('admin cria cidade', cityA.ok === true, cityA.msg);

  // Orcamento do consultor
  const b = await call('POST', '/web/budgets', C, {
    instituicao: 'Faculdade Exemplo', curso: 'Administração 2027', comissao: 'Comissão Demo',
    telefone: '(11) 90000-0000', totalValue: 12345.67, formData: { selectedEvents: [] }, status: 'PENDING', isLocked: false,
  });
  check('consultor cria orcamento', b.ok && b.data.id, b.msg);
  const budgetId = b.data.id;
  const list = await call('GET', '/web/budgets', C);
  check('consultor lista os proprios', list.ok && list.data.some((x) => x.id === budgetId) && list.data.every((x) => x.created_by_name === 'Consultor Demo'));
  const one = await call('GET', `/web/budgets/${budgetId}`, A);
  check('admin ve orcamento', one.ok && one.data.budget_code);

  // Pedido de desconto (multipart sem anexo)
  const fd = new FormData();
  fd.append('budgetId', budgetId); fd.append('clientName', 'Comissão Demo'); fd.append('totalValue', '12345.67');
  fd.append('discountPercent', '5'); fd.append('discountValue', '617.28'); fd.append('finalValue', '11728.39');
  fd.append('requestedBy', 'qualquer'); fd.append('requestObservation', 'teste');
  fd.append('attachment', new Blob(['%PDF-1.4 demo'], { type: 'application/pdf' }), 'comprovante.pdf');
  const dr = await fetch(BASE + '/web/discounts', { method: 'POST', headers: { Authorization: `Bearer ${C}` }, body: fd }).then((r) => r.json());
  const drd = decode(dr.payload);
  check('consultor pede desconto com anexo local', drd.boleano && drd.obj.attachment_url, drd.obj?.attachment_url);
  check('requested_by = usuario logado', drd.obj?.requested_by === 'Consultor Demo', drd.obj?.requested_by);
  if (drd.obj?.attachment_url) {
    const f = await fetch(drd.obj.attachment_url);
    check('anexo servido em /uploads', f.status === 200, String(f.status));
  }
  const apC = await call('PATCH', `/web/discounts/${drd.obj.id}/status`, C, { status: 'APPROVED', observation: 'eu mesmo' });
  check('consultor NAO aprova o proprio desconto', apC.status === 403, apC.msg);
  const apG = await call('PATCH', `/web/discounts/${drd.obj.id}/status`, G, { status: 'APPROVED', observation: 'ok', newDiscountPercent: 5 });
  check('gerente aprova desconto', apG.ok === true, apG.msg);

  // Item request + delete via query string
  const fi = new FormData();
  for (const [k, v] of Object.entries({ budgetId, clientName: 'x', eventId: 'aula_saudade', itemId: 'drinks', itemName: 'Drinks', originalUnitPrice: '144', requestedPercentage: '10', reason: 'teste' })) fi.append(k, v);
  const ir = decode((await fetch(BASE + '/web/discounts/items', { method: 'POST', headers: { Authorization: `Bearer ${C}` }, body: fi }).then((r) => r.json())).payload);
  check('pedido de desconto em item', ir.boleano, ir.mensagem);
  const del = await call('DELETE', `/web/discounts/items?budgetId=${budgetId}&eventId=aula_saudade&itemId=drinks`, C);
  check('consultor remove pedido de item (query string)', del.ok === true, del.msg);

  // Edicao: pedido e aprovacao
  const er = await call('POST', '/web/edits', C, { budgetId, clientName: 'x', reason: 'ajuste' });
  check('pedido de edicao', er.ok, er.msg);
  const erC = await call('PATCH', `/web/edits/${er.data.id}/status`, C, { status: 'APPROVED', observation: '' });
  check('consultor NAO aprova edicao', erC.status === 403, erC.msg);
  const erG = await call('PATCH', `/web/edits/${er.data.id}/status`, G, { status: 'APPROVED', observation: '' });
  check('gerente aprova edicao', erG.ok, erG.msg);

  // Devolutiva do analista
  const rv = await call('POST', '/web/budget-reviews', N, { budget_id: budgetId, kind: 'devolutiva', message: 'Conferir quantidades.' });
  check('analista envia devolutiva', rv.ok, rv.msg);
  const nWrite = await call('PUT', `/web/budgets/${budgetId}`, N, { instituicao: 'x' });
  check('analista NAO edita orcamento', nWrite.status === 403, nWrite.msg);

  // Outro consultor nao enxerga
  const other = await call('POST', '/web/users', A, { name: 'Outro Consultor', login: `outro-${RUN}`, password: 'Senha@1234', role: 'ADM_ORCAMENTO', active: true, permissions: { createBudget: true } });
  check('admin cria usuario', other.ok, other.msg);
  const O = (await login(`outro-${RUN}`, 'Senha@1234')).data.token;
  const oView = await call('GET', `/web/budgets/${budgetId}`, O);
  check('outro consultor NAO ve orcamento alheio', oView.status === 403, oView.msg);
  const oDisc = await call('GET', `/web/discounts/budget/${budgetId}`, O);
  check('outro consultor NAO ve descontos alheios', oDisc.status === 403, oDisc.msg);
  const oAll = await call('GET', '/web/discounts', O);
  check('fila de descontos filtrada', oAll.ok && oAll.data.every((r) => r.budget_id !== budgetId), `${oAll.data?.length}`);
  const oRev = await call('GET', `/web/budget-reviews/${budgetId}`, O);
  check('outro consultor NAO ve devolutivas alheias', oRev.status === 403, oRev.msg);

  // Gerente (perm_manage_users=false) / usuario com manage_users nao cria master
  const mgr = await call('POST', '/web/users', A, { name: 'RH Demo', login: `rh-${RUN}`, password: 'Senha@1234', role: 'ADM_ORCAMENTO', active: true, permissions: { manageUsers: true } });
  const R = (await login(`rh-${RUN}`, 'Senha@1234')).data.token;
  const esc = await call('POST', '/web/users', R, { name: 'Novo Master', login: 'm2', password: 'Senha@1234', role: 'ADM_MASTER', active: true, permissions: {} });
  check('gerenciador de usuarios NAO cria master', mgr.ok && esc.status === 403, esc.msg);
  const self = await call('PUT', `/web/users/${mgr.data.id}`, R, { name: 'RH Demo', login: `rh-${RUN}`, role: 'ADM_MASTER', active: true, permissions: { manageUsers: true } });
  check('gerenciador de usuarios NAO se promove', self.status === 403, self.msg);

  // Desativar invalida o token na hora
  await call('PUT', `/web/users/${other.data.id}`, A, { name: 'Outro Consultor', login: `outro-${RUN}`, role: 'ADM_ORCAMENTO', active: false, permissions: { createBudget: true } });
  const after = await call('GET', '/web/budgets', O);
  check('usuario desativado perde acesso', after.ok === false && /token/i.test(after.msg), after.msg);

  // Demonstrativo publico: envelope assinado nao serve de token
  const share = await call('POST', `/web/budgets/${budgetId}/share`, C);
  check('gera link do demonstrativo', share.ok && share.data.token);
  const pubRaw = await fetch(`${BASE}/public/demonstrativo/${share.data.token}`).then((r) => r.json());
  const pub = decode(pubRaw.payload);
  check('demonstrativo publico abre', pub.boleano && pub.obj.budget.id === budgetId);
  check('demonstrativo sem id do criador', pub.obj.budget.created_by_user_id === undefined);
  // Envelope pequeno (o do demonstrativo inteiro nem cabe num cabecalho HTTP).
  const small = await fetch(`${BASE}/public/demonstrativo/inexistente`).then((r) => r.json());
  const reuse = await call('GET', '/web/discounts', small.payload);
  check('envelope de resposta NAO vale como token', reuse.ok === false, reuse.msg);

  const dash = await call('GET', '/web/dashboard/summary?preset=6m', A);
  check('dashboard', dash.ok && dash.data.metrics.total_budgets >= 1, JSON.stringify(dash.data?.metrics?.total_budgets));
  const logs = await call('GET', '/web/logs?page=1&pageSize=5', A);
  check('trilha de auditoria', logs.ok && logs.data.total > 0, `${logs.data?.total} registros`);
  const venue = await call('GET', '/web/venue-proposals/settings', C);
  check('tabela de precos da locacao', venue.ok && venue.data.data.entrances.length === 3);
  const vp = await call('POST', '/web/venue-proposals', C, { clientName: 'Cliente Demo', eventType: 'Feira', guests: 500, eventDate: '2027-03-10', entranceId: 'setor_b', subtotal: 54000, totalValue: 54000, data: {} });
  check('consultor cria proposta de locacao', vp.ok && vp.data.proposal_code, vp.msg);
  const vv = await call('POST', `/web/venue-proposals/${vp.data.id}/versions`, C, { clientName: 'Cliente Demo', eventType: 'Feira', guests: 600, eventDate: '2027-03-10', entranceId: 'setor_b', subtotal: 54000, totalValue: 54000, data: {} });
  check('nova versao da proposta', vv.ok && vv.data.version === 2, vv.msg);

  const cors = await fetch(BASE + '/health', { headers: { Origin: 'https://evil.example.com' } });
  check('CORS nao libera origem desconhecida', !cors.headers.get('access-control-allow-origin'));

  console.log(fails ? `\n${fails} falha(s)` : '\ntudo certo');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
