// ============================================================
// LIFE OS — app.js
// Renderização, navegação, modais, login, init.
// ============================================================

const Auth  = window.LifeAuth;
const Store = window.LifeStore;
const state = Store.state;

// ===== utils =====
const fmt  = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const todayISO = () => new Date().toISOString().slice(0, 10);
function getWeekDay() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }
function isThisWeek(dateStr) { return dateStr && Store.getWeekKey(new Date(dateStr + 'T00:00:00')) === Store.getWeekKey(); }
function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

// ===== UI service (toast / saving / modal) =====
const UI = (window.LifeUI = (() => {
  function toast(msg, kind = 'info') {
    const c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; }, 2800);
    setTimeout(() => el.remove(), 3200);
  }
  let savingTimer;
  function showSaving() {
    const ind = document.getElementById('savingIndicator');
    ind.classList.add('show');
    clearTimeout(savingTimer);
    savingTimer = setTimeout(() => ind.classList.remove('show'), 1200);
    const el = document.getElementById('lastSync');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function showModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalBackdrop').classList.add('show');
  }
  function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('show');
  }
  return { toast, showSaving, showModal, closeModal };
})());

window.closeModal = UI.closeModal;

// ===== Navigation =====
const titles = {
  dashboard: { bc: 'LIFE_OS / DASHBOARD', t: () => greeting() },
  financas: { bc: 'LIFE_OS / FINANCAS / VISAO', t: 'Visão <em>financeira</em>' },
  cartoes: { bc: 'LIFE_OS / FINANCAS / CARTOES', t: 'Cartões de <em>crédito</em>' },
  investimentos: { bc: 'LIFE_OS / FINANCAS / INVESTIMENTOS', t: 'Investimentos &amp; <em>patrimônio</em>' },
  metas: { bc: 'LIFE_OS / VIDA / METAS', t: 'Metas <em>anuais</em>' },
  rotina: { bc: 'LIFE_OS / VIDA / ROTINA', t: 'Rotina &amp; <em>hábitos</em>' },
  familia: { bc: 'LIFE_OS / VIDA / FAMILIA', t: 'Tempo com <em>família</em>' },
  estudos: { bc: 'LIFE_OS / CRESCIMENTO / ESTUDOS', t: 'Estudos &amp; <em>aprendizado</em>' },
  esporte: { bc: 'LIFE_OS / CRESCIMENTO / ESPORTE', t: 'Esporte &amp; <em>saúde</em>' },
  viagens: { bc: 'LIFE_OS / CRESCIMENTO / VIAGENS', t: 'Viagens &amp; <em>compras</em>' },
  settings: { bc: 'LIFE_OS / CONTA', t: 'Configurações' },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return 'Boa madrugada, <em>foco.</em>';
  if (h < 12) return 'Bom dia, <em>controle.</em>';
  if (h < 18) return 'Boa tarde, <em>execução.</em>';
  return 'Boa noite, <em>reflexão.</em>';
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
  document.querySelectorAll('.bn-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
  document.querySelectorAll('.sheet-link').forEach(i => i.classList.toggle('active', i.dataset.page === page));

  const cfg = titles[page] || titles.dashboard;
  document.getElementById('breadcrumb').textContent = cfg.bc;
  document.getElementById('pageTitle').innerHTML = typeof cfg.t === 'function' ? cfg.t() : cfg.t;

  closeMoreSheet();
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderAll();
}

function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    if (el.id === 'bnMoreBtn') return;
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
  document.getElementById('bnMoreBtn').addEventListener('click', openMoreSheet);
  document.getElementById('mobileMenuBtn').addEventListener('click', openMoreSheet);
}

function openMoreSheet() {
  document.getElementById('moreSheet').classList.add('show');
}
function closeMoreSheet() {
  document.getElementById('moreSheet').classList.remove('show');
}

// ===== Topbar meta =====
function updateTopbar() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('topbarMeta').innerHTML = `
    <div><strong>${escapeHtml(dateStr.toUpperCase())}</strong></div>
    <div>${time} · SEMANA ${Store.getWeekKey().slice(-2)}</div>
  `;
}

// ===== TRANSACTIONS =====
async function addTransactionFromForm() {
  const type = document.getElementById('txType').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const desc = document.getElementById('txDesc').value.trim();
  const cat = document.getElementById('txCategory').value;
  const date = document.getElementById('txDate').value || todayISO();
  if (!amount || !desc) { UI.toast('Preencha valor e descrição', 'error'); return; }
  try {
    await Store.addTransaction({ type, amount, desc, category: cat, date });
    document.getElementById('txAmount').value = '';
    document.getElementById('txDesc').value = '';
    renderAll();
  } catch {}
}
window.deleteTransaction = async (id) => {
  await Store.deleteTransaction(id); renderAll();
};

function renderTransactions() {
  const list = document.getElementById('txList');
  if (!state.transactions.length) {
    list.innerHTML = '<div class="empty-state">Sem transações ainda.</div>';
  } else {
    const recent = state.transactions.slice(0, 30);
    list.innerHTML = recent.map(t => `
      <div class="tx-row">
        <div class="tx-icon">${t.type === 'income' ? '↗' : '↘'}</div>
        <div>
          <div style="font-weight: 500;">${escapeHtml(t.desc)}</div>
          <div style="font-size: 11px; color: var(--ink-dim);">
            <span class="tag">${escapeHtml(t.category)}</span> · ${formatDate(t.date)}
          </div>
        </div>
        <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'} R$ ${fmt(t.amount)}</div>
        <button class="btn-danger btn btn-sm" onclick="deleteTransaction('${t.id}')">×</button>
      </div>
    `).join('');
  }
  document.getElementById('txCount').textContent = state.transactions.length + ' lançamentos';

  const monthIncome = state.transactions.filter(t => t.type === 'income' && isThisMonth(t.date)).reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = state.transactions.filter(t => t.type === 'expense' && isThisMonth(t.date)).reduce((s, t) => s + Number(t.amount), 0);
  document.getElementById('finIncome').textContent = fmt(monthIncome);
  document.getElementById('finExpense').textContent = fmt(monthExpense);
  document.getElementById('finReserve').textContent = fmt(state.reserve);
  document.getElementById('monthBalance').textContent = fmt(monthIncome - monthExpense);
  document.getElementById('monthBalanceSub').textContent = `Receitas R$ ${fmt(monthIncome)} − Despesas R$ ${fmt(monthExpense)}`;
}

// ===== RESERVE =====
async function saveReserveFromForm() {
  const reserve = parseFloat(document.getElementById('reserveInput').value) || 0;
  const reserveGoal = parseFloat(document.getElementById('reserveGoal').value) || 0;
  try { await Store.setPrefs({ reserve, reserveGoal }); renderAll(); } catch {}
}
function renderReserve() {
  document.getElementById('reserveInput').value = state.reserve || '';
  document.getElementById('reserveGoal').value = state.reserveGoal || '';
  const pct = state.reserveGoal > 0 ? Math.min(100, (state.reserve / state.reserveGoal) * 100) : 0;
  document.getElementById('reserveBar').style.width = pct + '%';
  document.getElementById('reserveStatus').textContent = state.reserveGoal
    ? `R$ ${fmt(state.reserve)} de R$ ${fmt(state.reserveGoal)} (${pct.toFixed(0)}%)`
    : 'Defina uma meta para acompanhar';
}

// ===== CARDS =====
window.openCardModal = (editId = null) => {
  const card = editId ? state.cards.find(c => c.id === editId) : null;
  UI.showModal(`
    <h3>${card ? 'Editar' : 'Novo'} cartão</h3>
    <div class="modal-form-row full">
      <div><label>Nome / Banco</label><input type="text" id="ccName" placeholder="Ex: Nubank Black" value="${escapeHtml(card?.name || '')}"></div>
    </div>
    <div class="modal-form-row">
      <div><label>Bandeira</label><select id="ccFlag">
        ${['VISA','MASTER','ELO','AMEX','HIPER'].map(f => `<option ${card?.flag === f ? 'selected' : ''}>${f}</option>`).join('')}
      </select></div>
      <div><label>Vencimento (dia)</label><input type="number" inputmode="numeric" min="1" max="31" id="ccDue" value="${card?.dueDay || ''}"></div>
    </div>
    <div class="modal-form-row">
      <div><label>Limite total (R$)</label><input type="number" inputmode="decimal" step="0.01" id="ccLimit" value="${card?.limit || ''}"></div>
      <div><label>Fatura atual (R$)</label><input type="number" inputmode="decimal" step="0.01" id="ccUsed" value="${card?.used || ''}"></div>
    </div>
    <div class="modal-actions">
      ${card ? `<button class="btn btn-danger" onclick="deleteCardConfirm('${card.id}')">Excluir</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveCardFromForm('${editId || ''}')">Salvar</button>
    </div>
  `);
};

window.saveCardFromForm = async (id) => {
  const card = {
    id: id || undefined,
    name: document.getElementById('ccName').value.trim(),
    flag: document.getElementById('ccFlag').value,
    dueDay: parseInt(document.getElementById('ccDue').value) || 1,
    limit: parseFloat(document.getElementById('ccLimit').value) || 0,
    used: parseFloat(document.getElementById('ccUsed').value) || 0,
  };
  if (!card.name) { UI.toast('Nome obrigatório', 'error'); return; }
  try { await Store.saveCard(card); UI.closeModal(); renderAll(); } catch {}
};

window.deleteCardConfirm = async (id) => {
  if (!confirm('Excluir cartão?')) return;
  try { await Store.deleteCard(id); UI.closeModal(); renderAll(); } catch {}
};

function renderCards() {
  const grid = document.getElementById('cardsGrid');
  if (!state.cards.length) {
    grid.innerHTML = '<div class="empty-state full-row">Nenhum cartão cadastrado ainda.</div>';
  } else {
    grid.innerHTML = state.cards.map(c => {
      const pct = c.limit > 0 ? (c.used / c.limit) * 100 : 0;
      const over = pct > 80;
      return `
        <div class="credit-card ${over ? 'over' : ''}" onclick="openCardModal('${c.id}')">
          <div class="cc-header">
            <div class="cc-bank">${escapeHtml(c.name)}</div>
            <div class="cc-flag">${escapeHtml(c.flag)}</div>
          </div>
          <div class="cc-limit-info">
            <div class="meta-mono">FATURA / LIMITE</div>
            <div class="cc-used">R$ ${fmt(c.used)}</div>
            <div class="cc-of">de R$ ${fmt(c.limit)} · vence dia ${c.dueDay}</div>
            <div class="pbar mt-8">
              <div class="pbar-fill ${over ? 'crimson' : ''}" style="width: ${Math.min(100, pct)}%"></div>
            </div>
            <div style="font-size: 10px; color: ${over ? 'var(--crimson)' : 'var(--ink-dim)'}; margin-top: 4px;">${pct.toFixed(0)}% utilizado</div>
          </div>
        </div>`;
    }).join('');
  }

  const totalLimit = state.cards.reduce((s, c) => s + Number(c.limit), 0);
  const totalUsed  = state.cards.reduce((s, c) => s + Number(c.used), 0);
  const avail = totalLimit - totalUsed;
  document.getElementById('ccTotalUsed').textContent  = fmt(totalUsed);
  document.getElementById('ccTotalAvail').textContent = fmt(avail);
  document.getElementById('ccTotalLimit').textContent = fmt(totalLimit);
  const pct = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
  document.getElementById('ccTotalBar').style.width = Math.min(100, pct) + '%';
  document.getElementById('ccTotalPct').textContent = pct.toFixed(0) + '% de utilização';

  document.getElementById('totalAvailable').textContent = fmt(avail);
  document.getElementById('totalAvailableSub').textContent = `de R$ ${fmt(totalLimit)} totais`;
}

// ===== INVESTMENTS =====
window.openInvestModal = (editId = null) => {
  const inv = editId ? state.investments.find(i => i.id === editId) : null;
  UI.showModal(`
    <h3>${inv ? 'Editar' : 'Nova'} posição</h3>
    <div class="modal-form-row full">
      <div><label>Nome do ativo</label><input type="text" id="invName" placeholder="Ex: Tesouro Selic, ITSA4..." value="${escapeHtml(inv?.name || '')}"></div>
    </div>
    <div class="modal-form-row">
      <div><label>Tipo</label><select id="invType">
        <option value="fixed" ${inv?.type === 'fixed' ? 'selected' : ''}>Renda Fixa</option>
        <option value="variable" ${inv?.type === 'variable' ? 'selected' : ''}>Renda Variável</option>
        <option value="other" ${inv?.type === 'other' ? 'selected' : ''}>Outros</option>
      </select></div>
      <div><label>Valor atual (R$)</label><input type="number" inputmode="decimal" step="0.01" id="invAmount" value="${inv?.amount || ''}"></div>
    </div>
    <div class="modal-actions">
      ${inv ? `<button class="btn btn-danger" onclick="deleteInvestConfirm('${inv.id}')">Excluir</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveInvestFromForm('${editId || ''}')">Salvar</button>
    </div>
  `);
};

window.saveInvestFromForm = async (id) => {
  const inv = {
    id: id || undefined,
    name: document.getElementById('invName').value.trim(),
    type: document.getElementById('invType').value,
    amount: parseFloat(document.getElementById('invAmount').value) || 0,
  };
  if (!inv.name) { UI.toast('Nome obrigatório', 'error'); return; }
  try { await Store.saveInvestment(inv); UI.closeModal(); renderAll(); } catch {}
};
window.deleteInvestConfirm = async (id) => {
  if (!confirm('Excluir investimento?')) return;
  try { await Store.deleteInvestment(id); UI.closeModal(); renderAll(); } catch {}
};

function renderInvestments() {
  const list = document.getElementById('invList');
  if (!state.investments.length) {
    list.innerHTML = '<div class="empty-state">Nenhum investimento cadastrado.</div>';
  } else {
    list.innerHTML = state.investments.map(i => `
      <div class="list-item" onclick="openInvestModal('${i.id}')" style="cursor:pointer;">
        <div>
          <div class="name">${escapeHtml(i.name)}</div>
          <div class="meta">
            <span class="tag ${i.type === 'fixed' ? 'azure' : i.type === 'variable' ? 'gold' : ''}">${i.type === 'fixed' ? 'Renda Fixa' : i.type === 'variable' ? 'Renda Variável' : 'Outros'}</span>
          </div>
        </div>
        <div class="amount">R$ ${fmt(i.amount)}</div>
      </div>
    `).join('');
  }
  const fixed    = state.investments.filter(i => i.type === 'fixed').reduce((s, i) => s + Number(i.amount), 0);
  const variable = state.investments.filter(i => i.type === 'variable').reduce((s, i) => s + Number(i.amount), 0);
  const other    = state.investments.filter(i => i.type === 'other').reduce((s, i) => s + Number(i.amount), 0);
  const total = fixed + variable + other;
  document.getElementById('invTotal').textContent = fmt(total);
  document.getElementById('invFixed').textContent = fmt(fixed);
  document.getElementById('invVariable').textContent = fmt(variable);

  // Dashboard hero
  const reserveAmt = Number(state.reserve) || 0;
  const cardDebt = state.cards.reduce((s, c) => s + Number(c.used), 0);
  const netWorth = total + reserveAmt - cardDebt;
  document.getElementById('heroNetWorth').textContent = fmt0(Math.max(0, netWorth));
  const monthIncome = state.transactions.filter(t => t.type === 'income' && isThisMonth(t.date)).reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = state.transactions.filter(t => t.type === 'expense' && isThisMonth(t.date)).reduce((s, t) => s + Number(t.amount), 0);
  const balance = monthIncome - monthExpense;
  const deltaEl = document.getElementById('heroDelta');
  if (state.transactions.length === 0 && total === 0 && state.cards.length === 0) {
    deltaEl.textContent = '— defina suas finanças para começar';
    deltaEl.classList.remove('neg');
  } else {
    deltaEl.textContent = `${balance >= 0 ? '↗' : '↘'} R$ ${fmt(Math.abs(balance))} este mês`;
    deltaEl.classList.toggle('neg', balance < 0);
  }
}

// ===== GOALS =====
let activeGoalTab = 'all';

function setupGoalTabs() {
  document.querySelectorAll('#page-metas .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#page-metas .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeGoalTab = t.dataset.tab;
      renderGoals();
    });
  });
}

window.openGoalModal = (editId = null) => {
  const g = editId ? state.goals.find(x => x.id === editId) : null;
  UI.showModal(`
    <h3>${g ? 'Editar' : 'Nova'} meta</h3>
    <div class="modal-form-row full">
      <div><label>Título</label><input type="text" id="gTitle" value="${escapeHtml(g?.title || '')}" placeholder="Ex: Comprar carro novo, Promoção, Maratona..."></div>
    </div>
    <div class="modal-form-row">
      <div><label>Categoria</label><select id="gCat">
        ${['financeira','profissional','pessoal','compra'].map(c => `<option value="${c}" ${g?.cat === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select></div>
      <div><label>Prazo</label><input type="date" id="gDeadline" value="${g?.deadline || ''}"></div>
    </div>
    <div class="modal-form-row">
      <div><label>Valor alvo (opcional)</label><input type="number" inputmode="decimal" step="0.01" id="gTarget" value="${g?.target || ''}" placeholder="Ex: 50000"></div>
      <div><label>Progresso atual</label><input type="number" inputmode="decimal" step="0.01" id="gCurrent" value="${g?.current || 0}"></div>
    </div>
    <div class="modal-form-row full">
      <div><label>Descrição / próximo passo</label><textarea id="gDesc" rows="3">${escapeHtml(g?.desc || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      ${g ? `<button class="btn btn-danger" onclick="deleteGoalConfirm('${g.id}')">Excluir</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveGoalFromForm('${editId || ''}')">Salvar</button>
    </div>
  `);
};

window.saveGoalFromForm = async (id) => {
  const g = {
    id: id || undefined,
    title: document.getElementById('gTitle').value.trim(),
    cat: document.getElementById('gCat').value,
    deadline: document.getElementById('gDeadline').value,
    target: parseFloat(document.getElementById('gTarget').value) || 0,
    current: parseFloat(document.getElementById('gCurrent').value) || 0,
    desc: document.getElementById('gDesc').value.trim(),
  };
  if (!g.title) { UI.toast('Título obrigatório', 'error'); return; }
  try { await Store.saveGoal(g); UI.closeModal(); renderAll(); } catch {}
};

window.deleteGoalConfirm = async (id) => {
  if (!confirm('Excluir meta?')) return;
  try { await Store.deleteGoal(id); UI.closeModal(); renderAll(); } catch {}
};

function renderGoals() {
  const list = document.getElementById('goalsList');
  let filtered = state.goals;
  if (activeGoalTab !== 'all') filtered = filtered.filter(g => g.cat === activeGoalTab);

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma meta nesta categoria.</div>';
  } else {
    const colorMap = { financeira: 'emerald', profissional: 'azure', pessoal: 'plum', compra: '' };
    list.innerHTML = filtered.map(g => {
      const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : (g.current >= 1 ? 100 : 0);
      return `
        <div class="goal-item" onclick="openGoalModal('${g.id}')">
          <div class="goal-item-header">
            <div>
              <span class="title">${escapeHtml(g.title)}</span>
              <span class="tag ${colorMap[g.cat]}">${g.cat}</span>
            </div>
            <span class="pct">${pct.toFixed(0)}%</span>
          </div>
          ${g.target > 0 ? `<div style="font-size: 12px; color: var(--ink-dim);">R$ ${fmt(g.current)} / R$ ${fmt(g.target)}</div>` : ''}
          <div class="pbar"><div class="pbar-fill ${colorMap[g.cat]}" style="width: ${pct}%"></div></div>
          ${g.deadline ? `<div class="deadline">Prazo: ${formatDate(g.deadline)}</div>` : ''}
          ${g.desc ? `<div style="font-size: 12px; color: var(--ink-dim); margin-top: 6px; font-style: italic;">${escapeHtml(g.desc)}</div>` : ''}
        </div>`;
    }).join('');
  }

  // Dashboard preview
  const dashList = document.getElementById('dashGoalsList');
  if (!state.goals.length) {
    dashList.innerHTML = '<div class="empty-state">Nenhuma meta cadastrada — vá em <strong>Metas Anuais</strong></div>';
  } else {
    const colorMap = { financeira: 'emerald', profissional: 'azure', pessoal: 'plum', compra: '' };
    const top3 = state.goals.slice(0, 3);
    dashList.innerHTML = top3.map(g => {
      const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : (g.current >= 1 ? 100 : 0);
      return `
        <div class="goal-item" style="padding: 10px 0;">
          <div class="goal-item-header">
            <span class="title" style="font-size: 13px;">${escapeHtml(g.title)}</span>
            <span class="pct">${pct.toFixed(0)}%</span>
          </div>
          <div class="pbar"><div class="pbar-fill ${colorMap[g.cat]}" style="width: ${pct}%"></div></div>
        </div>`;
    }).join('');
  }
  document.getElementById('goalsBadge').textContent = state.goals.length;
}

// ===== HABITS =====
window.openHabitModal = () => {
  UI.showModal(`
    <h3>Novo hábito</h3>
    <div class="modal-form-row full">
      <div><label>Nome do hábito</label><input type="text" id="habitName" placeholder="Ex: Ler 30min, Meditar, Sem celular após 22h..."></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveHabitFromForm()">Criar</button>
    </div>
  `);
  setTimeout(() => document.getElementById('habitName').focus(), 50);
};
window.saveHabitFromForm = async () => {
  const name = document.getElementById('habitName').value.trim();
  if (!name) return;
  try { await Store.addHabit(name); UI.closeModal(); renderHabits(); } catch {}
};
window.deleteHabitConfirm = async (id) => {
  if (!confirm('Excluir hábito?')) return;
  try { await Store.deleteHabit(id); renderHabits(); } catch {}
};
window.toggleHabit = async (habitId, day) => {
  await Store.toggleHabit(habitId, day);
  renderHabits();
};

function renderHabits() {
  const list = document.getElementById('habitsList');
  if (!state.habits.length) {
    list.innerHTML = '<div class="empty-state">Nenhum hábito ainda. Crie um para começar.</div>';
    document.getElementById('habitRing').setAttribute('stroke-dasharray', '0 264');
    document.getElementById('habitRingText').textContent = '0%';
    document.getElementById('habitSummary').textContent = '— sem hábitos';
    return;
  }
  const wk = Store.getWeekKey();
  const today = getWeekDay();
  let totalDone = 0, totalSlots = 0;
  list.innerHTML = state.habits.map(h => {
    const log = state.habitLog[h.id] || {};
    const cells = [];
    let streak = 0;
    for (let d = 0; d < 7; d++) {
      const k = `${wk}-${d}`;
      const done = !!log[k];
      if (d <= today) totalSlots++;
      if (done && d <= today) totalDone++;
      cells.push(`<div class="habit-cell ${done ? 'done' : ''}" onclick="toggleHabit('${h.id}', ${d})"></div>`);
    }
    // streak: count consecutive days with logs in current week from today backwards
    for (let d = today; d >= 0; d--) {
      if (log[`${wk}-${d}`]) streak++;
      else break;
    }
    return `
      <div class="habit-row">
        <div class="habit-name" onclick="deleteHabitConfirm('${h.id}')" title="Toque pra excluir">${escapeHtml(h.name)}</div>
        ${cells.join('')}
        <div class="habit-streak">${streak}d</div>
      </div>`;
  }).join('');

  const pct = totalSlots > 0 ? (totalDone / totalSlots) * 100 : 0;
  const dashArray = `${(pct / 100) * 264} 264`;
  document.getElementById('habitRing').setAttribute('stroke-dasharray', dashArray);
  document.getElementById('habitRingText').textContent = pct.toFixed(0) + '%';
  document.getElementById('habitSummary').textContent = `${totalDone} de ${totalSlots} marcados`;
}

// ===== ENERGY/FOCUS =====
function setupDots(dotsId, stateKey) {
  document.querySelectorAll(`#${dotsId} .dot`).forEach(d => {
    d.addEventListener('click', async () => {
      const v = parseInt(d.dataset.val);
      try { await Store.setDailyMetric(stateKey, v); renderDots(dotsId, dotsId === 'energyDots' ? 'energyLabel' : 'focusLabel', stateKey); } catch {}
    });
  });
}
function renderDots(dotsId, labelId, stateKey) {
  const today = todayISO();
  const v = state[stateKey][today] || 0;
  document.querySelectorAll(`#${dotsId} .dot`).forEach((d, i) => d.classList.toggle('active', i < v));
  const labels = ['—', 'Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'];
  document.getElementById(labelId).textContent = labels[v] || '—';
}

// ===== FAMILY =====
async function addFamilyTimeFromForm() {
  const date = document.getElementById('famDate').value || todayISO();
  const hours = parseFloat(document.getElementById('famHours').value);
  const activity = document.getElementById('famActivity').value.trim();
  if (!hours || !activity) { UI.toast('Preencha duração e atividade', 'error'); return; }
  try {
    await Store.addFamilyTime({ date, hours, activity });
    document.getElementById('famHours').value = '';
    document.getElementById('famActivity').value = '';
    renderFamily();
  } catch {}
}
window.deleteFamilyConfirm = async (id) => {
  if (!confirm('Remover momento?')) return;
  try { await Store.deleteFamilyTime(id); renderFamily(); } catch {}
};
async function saveFamilyGoalFromInput() {
  const familyGoal = parseFloat(document.getElementById('famGoalInput').value) || 0;
  try { await Store.setPrefs({ familyGoal }); renderFamily(); } catch {}
}

function renderFamily() {
  const weekItems = state.familyTime.filter(f => isThisWeek(f.date));
  const total = weekItems.reduce((s, f) => s + Number(f.hours), 0);
  document.getElementById('famWeekTotal').textContent = total.toFixed(1).replace('.0', '');
  document.getElementById('famWeekCount').textContent = `${weekItems.length} momentos registrados`;
  const goalInput = document.getElementById('famGoalInput');
  if (document.activeElement !== goalInput) goalInput.value = state.familyGoal || '';
  const pct = state.familyGoal > 0 ? Math.min(100, (total / state.familyGoal) * 100) : 0;
  document.getElementById('famGoalBar').style.width = pct + '%';
  document.getElementById('familyTime').textContent = total.toFixed(1).replace('.0', '') + 'h';

  const list = document.getElementById('famList');
  if (!state.familyTime.length) {
    list.innerHTML = '<div class="empty-state">Nenhum momento registrado ainda.</div>';
  } else {
    list.innerHTML = state.familyTime.slice(0, 20).map(f => `
      <div class="list-item">
        <div>
          <div class="name">${escapeHtml(f.activity)}</div>
          <div class="meta">${formatDate(f.date)}</div>
        </div>
        <div class="amount">${f.hours}h</div>
        <button class="btn-danger btn btn-sm" onclick="deleteFamilyConfirm('${f.id}')">×</button>
      </div>`).join('');
  }
}

// ===== STUDY =====
window.openStudyModal = (editId = null) => {
  const s = editId ? state.studyItems.find(x => x.id === editId) : null;
  UI.showModal(`
    <h3>${s ? 'Editar' : 'Novo'} item de estudo</h3>
    <div class="modal-form-row full">
      <div><label>Título</label><input type="text" id="stTitle" value="${escapeHtml(s?.title || '')}" placeholder="Ex: Curso de Python, livro Atomic Habits..."></div>
    </div>
    <div class="modal-form-row">
      <div><label>Tipo</label><select id="stType">
        ${[['curso','Curso'],['livro','Livro'],['certificacao','Certificação'],['outro','Outro']]
          .map(([v,l]) => `<option value="${v}" ${s?.type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
      <div><label>Status</label><select id="stStatus">
        ${[['andamento','Em andamento'],['planejado','Planejado'],['concluido','Concluído']]
          .map(([v,l]) => `<option value="${v}" ${s?.status === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    </div>
    <div class="modal-form-row">
      <div><label>Progresso (%)</label><input type="number" inputmode="numeric" min="0" max="100" id="stProgress" value="${s?.progress || 0}"></div>
      <div><label>Total de horas estimadas</label><input type="number" inputmode="decimal" step="0.5" id="stTotalHours" value="${s?.totalHours || 0}"></div>
    </div>
    <div class="modal-actions">
      ${s ? `<button class="btn btn-danger" onclick="deleteStudyConfirm('${s.id}')">Excluir</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveStudyFromForm('${editId || ''}')">Salvar</button>
    </div>
  `);
};
window.saveStudyFromForm = async (id) => {
  const item = {
    id: id || undefined,
    title: document.getElementById('stTitle').value.trim(),
    type: document.getElementById('stType').value,
    status: document.getElementById('stStatus').value,
    progress: parseFloat(document.getElementById('stProgress').value) || 0,
    totalHours: parseFloat(document.getElementById('stTotalHours').value) || 0,
  };
  if (!item.title) { UI.toast('Título obrigatório', 'error'); return; }
  try { await Store.saveStudyItem(item); UI.closeModal(); renderStudy(); } catch {}
};
window.deleteStudyConfirm = async (id) => {
  if (!confirm('Excluir item de estudo?')) return;
  try { await Store.deleteStudyItem(id); UI.closeModal(); renderStudy(); } catch {}
};
async function logStudySessionFromForm() {
  const itemId = document.getElementById('studySession').value;
  const hours = parseFloat(document.getElementById('studySessionHours').value);
  if (!itemId || !hours) { UI.toast('Selecione item e horas', 'error'); return; }
  try {
    await Store.logStudySession(itemId, hours);
    document.getElementById('studySessionHours').value = '';
    renderStudy();
  } catch {}
}

function renderStudy() {
  const sel = document.getElementById('studySession');
  sel.innerHTML = '<option value="">Selecione...</option>' + state.studyItems.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('');

  const list = document.getElementById('studyList');
  if (!state.studyItems.length) {
    list.innerHTML = '<div class="empty-state">Adicione cursos e livros que está estudando.</div>';
  } else {
    list.innerHTML = state.studyItems.map(s => `
      <div class="goal-item" onclick="openStudyModal('${s.id}')">
        <div class="goal-item-header">
          <div>
            <span class="title">${escapeHtml(s.title)}</span>
            <span class="tag azure">${s.type}</span>
            <span class="tag ${s.status === 'concluido' ? 'emerald' : s.status === 'andamento' ? 'gold' : ''}">${s.status}</span>
          </div>
          <span class="pct">${s.progress}%</span>
        </div>
        <div class="pbar"><div class="pbar-fill azure" style="width: ${s.progress}%"></div></div>
      </div>
    `).join('');
  }
  document.getElementById('studyActive').textContent = state.studyItems.filter(s => s.status === 'andamento').length;
  document.getElementById('studyDone').textContent   = state.studyItems.filter(s => s.status === 'concluido').length;
  const weekHours = state.studySessions.filter(s => isThisWeek(s.date)).reduce((acc, s) => acc + Number(s.hours), 0);
  document.getElementById('studyWeekHours').textContent = weekHours.toFixed(1).replace('.0', '');
  document.getElementById('studyTime').textContent = weekHours.toFixed(1).replace('.0', '') + 'h';
}

// ===== WORKOUT =====
window.openWorkoutModal = () => {
  UI.showModal(`
    <h3>Registrar treino</h3>
    <div class="modal-form-row">
      <div><label>Data</label><input type="date" id="wkDate" value="${todayISO()}"></div>
      <div><label>Tipo</label><select id="wkType">
        ${['Musculação','Corrida','Bicicleta','Natação','Yoga / Mobilidade','Esporte coletivo','Outro'].map(o => `<option>${o}</option>`).join('')}
      </select></div>
    </div>
    <div class="modal-form-row">
      <div><label>Duração (min)</label><input type="number" inputmode="numeric" id="wkDuration" placeholder="60"></div>
      <div><label>Intensidade (1-5)</label><input type="number" inputmode="numeric" min="1" max="5" id="wkIntensity" value="3"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveWorkoutFromForm()">Salvar</button>
    </div>
  `);
};
window.saveWorkoutFromForm = async () => {
  const w = {
    date: document.getElementById('wkDate').value,
    type: document.getElementById('wkType').value,
    duration: parseInt(document.getElementById('wkDuration').value) || 0,
    intensity: parseInt(document.getElementById('wkIntensity').value) || 3,
  };
  try { await Store.saveWorkout(w); UI.closeModal(); renderWorkouts(); } catch {}
};
window.deleteWorkoutConfirm = async (id) => {
  if (!confirm('Excluir treino?')) return;
  try { await Store.deleteWorkout(id); renderWorkouts(); } catch {}
};
async function saveWorkoutGoalFromInput() {
  const workoutGoal = parseInt(document.getElementById('wkGoal').value) || 0;
  try { await Store.setPrefs({ workoutGoal }); } catch {}
}

function renderWorkouts() {
  const list = document.getElementById('workoutList');
  if (!state.workouts.length) {
    list.innerHTML = '<div class="empty-state">Nenhum treino registrado.</div>';
  } else {
    list.innerHTML = state.workouts.slice(0, 20).map(w => `
      <div class="list-item">
        <div>
          <div class="name">${escapeHtml(w.type)}</div>
          <div class="meta">${formatDate(w.date)} · ${w.duration}min · intensidade ${w.intensity}/5</div>
        </div>
        <div class="amount">${w.duration}min</div>
        <button class="btn-danger btn btn-sm" onclick="deleteWorkoutConfirm('${w.id}')">×</button>
      </div>`).join('');
  }
  const week = state.workouts.filter(w => isThisWeek(w.date)).length;
  const month = state.workouts.filter(w => isThisMonth(w.date)).length;
  document.getElementById('wkWeek').textContent = week;
  document.getElementById('wkMonth').textContent = month;
  const goalInput = document.getElementById('wkGoal');
  if (document.activeElement !== goalInput) goalInput.value = state.workoutGoal || '';
  document.getElementById('workoutCount').textContent = week;

  const dates = [...new Set(state.workouts.map(w => w.date))].sort().reverse();
  let streak = 0;
  let cursor = new Date();
  for (const d of dates) {
    const dStr = cursor.toISOString().slice(0, 10);
    if (d === dStr) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  document.getElementById('wkStreak').textContent = streak;
}

// ===== TRIPS =====
window.openTripModal = (editId = null) => {
  const t = editId ? state.trips.find(x => x.id === editId) : null;
  UI.showModal(`
    <h3>${t ? 'Editar' : 'Novo'} plano</h3>
    <div class="modal-form-row full">
      <div><label>Título</label><input type="text" id="trTitle" value="${escapeHtml(t?.title || '')}" placeholder="Ex: Praia em janeiro, novo MacBook..."></div>
    </div>
    <div class="modal-form-row">
      <div><label>Tipo</label><select id="trType">
        ${[['viagem','Viagem'],['compra','Compra'],['evento','Evento']]
          .map(([v,l]) => `<option value="${v}" ${t?.type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
      <div><label>Data alvo</label><input type="date" id="trDate" value="${t?.date || ''}"></div>
    </div>
    <div class="modal-form-row">
      <div><label>Custo estimado (R$)</label><input type="number" inputmode="decimal" step="0.01" id="trCost" value="${t?.cost || 0}"></div>
      <div><label>Já guardado (R$)</label><input type="number" inputmode="decimal" step="0.01" id="trSaved" value="${t?.saved || 0}"></div>
    </div>
    <div class="modal-form-row full">
      <div><label>Observações</label><textarea id="trNotes" rows="3">${escapeHtml(t?.notes || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      ${t ? `<button class="btn btn-danger" onclick="deleteTripConfirm('${t.id}')">Excluir</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="saveTripFromForm('${editId || ''}')">Salvar</button>
    </div>
  `);
};
window.saveTripFromForm = async (id) => {
  const t = {
    id: id || undefined,
    title: document.getElementById('trTitle').value.trim(),
    type: document.getElementById('trType').value,
    date: document.getElementById('trDate').value,
    cost: parseFloat(document.getElementById('trCost').value) || 0,
    saved: parseFloat(document.getElementById('trSaved').value) || 0,
    notes: document.getElementById('trNotes').value.trim(),
  };
  if (!t.title) { UI.toast('Título obrigatório', 'error'); return; }
  try { await Store.saveTrip(t); UI.closeModal(); renderTrips(); } catch {}
};
window.deleteTripConfirm = async (id) => {
  if (!confirm('Excluir plano?')) return;
  try { await Store.deleteTrip(id); UI.closeModal(); renderTrips(); } catch {}
};

function renderTrips() {
  const list = document.getElementById('tripsList');
  if (!state.trips.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma viagem ou compra planejada ainda.</div>';
  } else {
    const icons = { viagem: '✈', compra: '◆', evento: '★' };
    list.innerHTML = state.trips.map(t => {
      const pct = t.cost > 0 ? Math.min(100, (t.saved / t.cost) * 100) : 0;
      return `
        <div class="goal-item" onclick="openTripModal('${t.id}')">
          <div class="goal-item-header">
            <div>
              <span style="font-size: 16px; margin-right: 6px;">${icons[t.type] || '◆'}</span>
              <span class="title">${escapeHtml(t.title)}</span>
              <span class="tag">${t.type}</span>
            </div>
            <span class="pct">${pct.toFixed(0)}%</span>
          </div>
          <div style="font-size: 12px; color: var(--ink-dim); margin: 4px 0;">R$ ${fmt(t.saved)} / R$ ${fmt(t.cost)}${t.date ? ` · ${formatDate(t.date)}` : ''}</div>
          <div class="pbar"><div class="pbar-fill" style="width: ${pct}%"></div></div>
          ${t.notes ? `<div style="font-size: 12px; color: var(--ink-faint); margin-top: 6px; font-style: italic;">${escapeHtml(t.notes)}</div>` : ''}
        </div>`;
    }).join('');
  }

  const dashTrips = document.getElementById('dashTrips');
  const upcoming = state.trips.filter(t => t.date && t.date >= todayISO()).slice(0, 3);
  if (!upcoming.length) {
    dashTrips.innerHTML = '<div class="empty-state">Nenhum plano cadastrado</div>';
  } else {
    dashTrips.innerHTML = upcoming.map(t => {
      const pct = t.cost > 0 ? Math.min(100, (t.saved / t.cost) * 100) : 0;
      return `
        <div class="goal-item" style="padding: 10px 0;">
          <div class="goal-item-header">
            <span class="title" style="font-size: 13px;">${escapeHtml(t.title)}</span>
            <span class="meta-mono">${formatDate(t.date)}</span>
          </div>
          <div class="pbar"><div class="pbar-fill" style="width: ${pct}%"></div></div>
        </div>`;
    }).join('');
  }
}

// ===== MODAL backdrop =====
function setupModalBackdrop() {
  document.getElementById('modalBackdrop').addEventListener('click', e => {
    if (e.target.id === 'modalBackdrop') UI.closeModal();
  });
  document.getElementById('moreSheet').addEventListener('click', e => {
    if (e.target.id === 'moreSheet') closeMoreSheet();
  });
}

// ===== SETTINGS / IMPORT / EXPORT =====
function setupSettings() {
  document.getElementById('btnSignOut').addEventListener('click', () => Auth.signOut());

  document.getElementById('btnExport').addEventListener('click', () => {
    const dump = Store.exportBackup();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeos-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Backup baixado', 'ok');
  });

  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('importStatus');
    status.textContent = 'Lendo arquivo...';
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      if (!confirm('Vai inserir todos os dados do backup no Supabase. Continuar?')) {
        status.textContent = '';
        e.target.value = '';
        return;
      }
      status.textContent = 'Importando...';
      const stats = await Store.importBackup(dump);
      status.textContent = `✓ ${stats.added} registros importados${stats.errors ? ` (${stats.errors} erros)` : ''}`;
      UI.toast(`Importação concluída: ${stats.added} registros`, 'ok');
      await Store.loadAll(state.user);
      renderAll();
    } catch (err) {
      console.error(err);
      status.textContent = 'Erro: ' + err.message;
      UI.toast('Erro ao importar: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btnResetAll').addEventListener('click', async () => {
    if (!confirm('⚠️ Apagar TUDO no Supabase. Tem certeza?')) return;
    if (!confirm('Última chance — confirma?')) return;
    const uid = state.user.id;
    const tables = ['transactions','cards','investments','goals','habit_logs','habits',
                    'family_time','study_sessions','study_items','workouts','trips','daily_metrics'];
    for (const t of tables) {
      await window.sb.from(t).delete().eq('user_id', uid);
    }
    await window.sb.from('user_preferences').update({
      reserve: 0, reserve_goal: 0, family_goal: 0, workout_goal: 0
    }).eq('user_id', uid);
    UI.toast('Tudo limpo', 'ok');
    await Store.loadAll(state.user);
    renderAll();
  });
}

function renderSettings() {
  const el = document.getElementById('settingsEmail');
  if (el) el.textContent = state.user?.email || '—';
  const badge = document.getElementById('userBadge');
  if (badge) badge.textContent = state.user?.email || '';
}

// ===== RENDER ALL =====
function renderAll() {
  if (!state.user) return;
  renderTransactions();
  renderReserve();
  renderCards();
  renderInvestments();
  renderGoals();
  renderHabits();
  renderDots('energyDots', 'energyLabel', 'energy');
  renderDots('focusDots', 'focusLabel', 'focus');
  renderFamily();
  renderStudy();
  renderWorkouts();
  renderTrips();
  renderSettings();
  document.getElementById('pageTitle').innerHTML = (() => {
    const active = document.querySelector('.page.active');
    if (!active) return greeting();
    const id = active.id.replace('page-', '');
    const cfg = titles[id];
    return typeof cfg?.t === 'function' ? cfg.t() : (cfg?.t || greeting());
  })();
}

// ===== Bind static buttons =====
function bindStaticButtons() {
  document.getElementById('btnAddTransaction').addEventListener('click', addTransactionFromForm);
  document.getElementById('btnSaveReserve').addEventListener('click', saveReserveFromForm);
  document.getElementById('btnNewCard').addEventListener('click', () => window.openCardModal());
  document.getElementById('btnNewInvest').addEventListener('click', () => window.openInvestModal());
  document.getElementById('btnNewGoal').addEventListener('click', () => window.openGoalModal());
  document.getElementById('btnNewHabit').addEventListener('click', () => window.openHabitModal());
  document.getElementById('btnAddFamily').addEventListener('click', addFamilyTimeFromForm);
  document.getElementById('btnNewStudy').addEventListener('click', () => window.openStudyModal());
  document.getElementById('btnLogStudy').addEventListener('click', logStudySessionFromForm);
  document.getElementById('btnNewWorkout').addEventListener('click', () => window.openWorkoutModal());
  document.getElementById('btnNewTrip').addEventListener('click', () => window.openTripModal());

  document.getElementById('famGoalInput').addEventListener('change', saveFamilyGoalFromInput);
  document.getElementById('wkGoal').addEventListener('change', saveWorkoutGoalFromInput);
}

// ===== AUTH FLOW =====
function showLogin() {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('app').hidden = true;

  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMsg');
  const btn = document.getElementById('loginBtn');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) return;
    btn.disabled = true; btn.textContent = 'Enviando...';
    msg.className = 'login-msg'; msg.textContent = '';
    try {
      await Auth.sendMagicLink(email);
      msg.className = 'login-msg ok';
      msg.textContent = '✓ Link enviado. Cheque seu email.';
      btn.textContent = 'Reenviar';
    } catch (err) {
      msg.className = 'login-msg error';
      msg.textContent = err.message || 'Falhou. Tenta de novo.';
      btn.textContent = 'Receber link mágico';
    } finally {
      btn.disabled = false;
    }
  };
}

async function showApp(user) {
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('app').hidden = false;
  document.body.style.overflow = '';

  setupNav();
  setupModalBackdrop();
  setupGoalTabs();
  setupDots('energyDots', 'energy');
  setupDots('focusDots', 'focus');
  bindStaticButtons();
  setupSettings();

  document.getElementById('txDate').value  = todayISO();
  document.getElementById('famDate').value = todayISO();

  updateTopbar();
  setInterval(updateTopbar, 60000);

  try {
    await Store.loadAll(user);
    renderAll();
    UI.showSaving();
  } catch (err) {
    console.error(err);
    UI.toast('Erro ao carregar dados: ' + err.message, 'error');
  }

  // Reage a mudanças de conexão
  window.addEventListener('online',  () => {
    document.getElementById('offlineBanner').hidden = true;
    UI.toast('Online novamente', 'ok');
  });
  window.addEventListener('offline', () => {
    document.getElementById('offlineBanner').hidden = false;
  });
  if (!navigator.onLine) document.getElementById('offlineBanner').hidden = false;
}

// ===== INIT =====
async function init() {
  // Hash route opcional pra navegação direta no celular (#metas etc)
  const hashPage = location.hash.replace('#', '');

  Auth.onAuthChange(user => {
    if (user) {
      if (state.user?.id !== user.id) {
        showApp(user).then(() => {
          if (hashPage && titles[hashPage]) navigateTo(hashPage);
        });
      }
    } else {
      state.user = null;
      showLogin();
    }
  });

  const user = await Auth.getUser();
  if (user) {
    await showApp(user);
    if (hashPage && titles[hashPage]) navigateTo(hashPage);
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
