// ============================================================
// STORE — estado in-memory + CRUD via Supabase + import de backup
// ============================================================

window.LifeStore = (function () {
  const sb = window.sb;

  const state = {
    user: null,
    transactions: [],
    cards: [],
    investments: [],
    goals: [],
    habits: [],
    habitLog: {},          // { habitId: { 'YYYY-WXX-D': true } } — derivado pra UI
    familyTime: [],
    familyGoal: 0,
    studyItems: [],
    studySessions: [],
    workouts: [],
    workoutGoal: 0,
    trips: [],
    reserve: 0,
    reserveGoal: 0,
    energy: {},            // { 'YYYY-MM-DD': 1..5 }
    focus: {},
  };

  // ===== Toast helper (UI mostra, store só dispara) =====
  function toast(msg, kind = 'info') {
    if (window.LifeUI?.toast) window.LifeUI.toast(msg, kind);
    else console[kind === 'error' ? 'error' : 'log'](msg);
  }

  function showSaving() {
    if (window.LifeUI?.showSaving) window.LifeUI.showSaving();
  }

  // ===== Date helpers (mesmas regras do app original) =====
  function getWeekKey(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  function isoWeekDay(d) { return ((d.getDay() + 6) % 7); } // 0=Mon

  // Converte `YYYY-WXX-D` (D=0..6, Mon..Sun) em data ISO (YYYY-MM-DD) da semana ATUAL
  // Para migração de dados antigos que só armazenavam week-day, usamos a semana atual como referência.
  function weekDayKeyToDate(weekDayKey, refDate = new Date()) {
    // formato: 'YYYY-WNN-D'
    const m = /^(\d{4})-W(\d{2})-(\d)$/.exec(weekDayKey);
    if (!m) return null;
    const [, year, week, day] = m;
    // ISO week: pega quinta-feira da primeira semana do ano
    const jan4 = new Date(Number(year), 0, 4);
    const jan4Dow = (jan4.getDay() + 6) % 7;
    const monday1 = new Date(jan4);
    monday1.setDate(jan4.getDate() - jan4Dow);
    const target = new Date(monday1);
    target.setDate(monday1.getDate() + (Number(week) - 1) * 7 + Number(day));
    return target.toISOString().slice(0, 10);
  }

  // ===== Mapeadores DB <-> app =====
  const map = {
    tx: {
      fromDb: r => ({ id: r.id, type: r.type, amount: Number(r.amount), desc: r.description, category: r.category, date: r.occurred_on }),
      toDb: t => ({ type: t.type, amount: t.amount, description: t.desc, category: t.category, occurred_on: t.date }),
    },
    card: {
      fromDb: r => ({ id: r.id, name: r.name, flag: r.flag, dueDay: r.due_day, limit: Number(r.credit_limit), used: Number(r.used) }),
      toDb: c => ({ name: c.name, flag: c.flag, due_day: c.dueDay, credit_limit: c.limit, used: c.used }),
    },
    inv: {
      fromDb: r => ({ id: r.id, name: r.name, type: r.type, amount: Number(r.amount) }),
      toDb: i => ({ name: i.name, type: i.type, amount: i.amount }),
    },
    goal: {
      fromDb: r => ({ id: r.id, title: r.title, cat: r.category, deadline: r.deadline, target: Number(r.target), current: Number(r.current_value), desc: r.description || '' }),
      toDb: g => ({ title: g.title, category: g.cat, deadline: g.deadline || null, target: g.target, current_value: g.current, description: g.desc }),
    },
    habit: {
      fromDb: r => ({ id: r.id, name: r.name }),
      toDb: h => ({ name: h.name }),
    },
    fam: {
      fromDb: r => ({ id: r.id, date: r.occurred_on, hours: Number(r.hours), activity: r.activity }),
      toDb: f => ({ occurred_on: f.date, hours: f.hours, activity: f.activity }),
    },
    study: {
      fromDb: r => ({ id: r.id, title: r.title, type: r.type, status: r.status, progress: r.progress, totalHours: Number(r.total_hours) }),
      toDb: s => ({ title: s.title, type: s.type, status: s.status, progress: s.progress, total_hours: s.totalHours }),
    },
    sess: {
      fromDb: r => ({ id: r.id, itemId: r.item_id, hours: Number(r.hours), date: r.occurred_on }),
      toDb: s => ({ item_id: s.itemId, hours: s.hours, occurred_on: s.date }),
    },
    workout: {
      fromDb: r => ({ id: r.id, date: r.occurred_on, type: r.type, duration: r.duration_min, intensity: r.intensity }),
      toDb: w => ({ occurred_on: w.date, type: w.type, duration_min: w.duration, intensity: w.intensity }),
    },
    trip: {
      fromDb: r => ({ id: r.id, title: r.title, type: r.type, date: r.target_date, cost: Number(r.cost), saved: Number(r.saved), notes: r.notes || '' }),
      toDb: t => ({ title: t.title, type: t.type, target_date: t.date || null, cost: t.cost, saved: t.saved, notes: t.notes }),
    },
  };

  // Reconstrói state.habitLog (formato 'YYYY-WXX-D') a partir das datas reais vindas do banco
  function rebuildHabitLog(rows) {
    const log = {};
    for (const r of rows) {
      const d = new Date(r.log_date + 'T00:00:00');
      const wk = getWeekKey(d);
      const dow = isoWeekDay(d);
      if (!log[r.habit_id]) log[r.habit_id] = {};
      log[r.habit_id][`${wk}-${dow}`] = true;
    }
    return log;
  }

  // ===== LOAD ALL =====
  async function loadAll(user) {
    state.user = user;
    const uid = user.id;

    const queries = await Promise.all([
      sb.from('transactions').select('*').eq('user_id', uid).order('occurred_on', { ascending: false }),
      sb.from('cards').select('*').eq('user_id', uid).order('created_at'),
      sb.from('investments').select('*').eq('user_id', uid).order('created_at'),
      sb.from('goals').select('*').eq('user_id', uid).order('created_at'),
      sb.from('habits').select('*').eq('user_id', uid).order('created_at'),
      sb.from('habit_logs').select('*').eq('user_id', uid),
      sb.from('family_time').select('*').eq('user_id', uid).order('occurred_on', { ascending: false }),
      sb.from('study_items').select('*').eq('user_id', uid).order('created_at'),
      sb.from('study_sessions').select('*').eq('user_id', uid),
      sb.from('workouts').select('*').eq('user_id', uid).order('occurred_on', { ascending: false }),
      sb.from('trips').select('*').eq('user_id', uid).order('target_date', { ascending: true, nullsFirst: false }),
      sb.from('user_preferences').select('*').eq('user_id', uid).maybeSingle(),
      sb.from('daily_metrics').select('*').eq('user_id', uid),
    ]);

    const [tx, cards, inv, goals, habits, hlogs, fam, study, sess, wk, tr, prefs, dm] = queries;

    for (const q of queries) if (q.error) console.error('Load error:', q.error);

    state.transactions = (tx.data || []).map(map.tx.fromDb);
    state.cards        = (cards.data || []).map(map.card.fromDb);
    state.investments  = (inv.data || []).map(map.inv.fromDb);
    state.goals        = (goals.data || []).map(map.goal.fromDb);
    state.habits       = (habits.data || []).map(map.habit.fromDb);
    state.habitLog     = rebuildHabitLog(hlogs.data || []);
    state.familyTime   = (fam.data || []).map(map.fam.fromDb);
    state.studyItems   = (study.data || []).map(map.study.fromDb);
    state.studySessions= (sess.data || []).map(map.sess.fromDb);
    state.workouts     = (wk.data || []).map(map.workout.fromDb);
    state.trips        = (tr.data || []).map(map.trip.fromDb);

    state.reserve = state.reserveGoal = state.familyGoal = state.workoutGoal = 0;
    if (prefs.data) {
      state.reserve      = Number(prefs.data.reserve) || 0;
      state.reserveGoal  = Number(prefs.data.reserve_goal) || 0;
      state.familyGoal   = Number(prefs.data.family_goal) || 0;
      state.workoutGoal  = Number(prefs.data.workout_goal) || 0;
    }

    state.energy = {}; state.focus = {};
    for (const m of (dm.data || [])) {
      if (m.energy != null) state.energy[m.date] = m.energy;
      if (m.focus  != null) state.focus[m.date]  = m.focus;
    }
  }

  // ===== Genéricos =====
  async function _insert(table, payload) {
    const { data, error } = await sb.from(table)
      .insert({ ...payload, user_id: state.user.id })
      .select()
      .single();
    if (error) { toast('Erro: ' + error.message, 'error'); throw error; }
    showSaving();
    return data;
  }
  async function _update(table, id, patch) {
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) { toast('Erro: ' + error.message, 'error'); throw error; }
    showSaving();
    return data;
  }
  async function _delete(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { toast('Erro: ' + error.message, 'error'); throw error; }
    showSaving();
  }

  // ===== TRANSACTIONS =====
  async function addTransaction(t) {
    const row = await _insert('transactions', map.tx.toDb(t));
    state.transactions.unshift(map.tx.fromDb(row));
    state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  }
  async function deleteTransaction(id) {
    await _delete('transactions', id);
    state.transactions = state.transactions.filter(t => t.id !== id);
  }

  // ===== CARDS =====
  async function saveCard(card) {
    if (card.id) {
      const row = await _update('cards', card.id, map.card.toDb(card));
      const i = state.cards.findIndex(c => c.id === card.id);
      if (i >= 0) state.cards[i] = map.card.fromDb(row);
    } else {
      const row = await _insert('cards', map.card.toDb(card));
      state.cards.push(map.card.fromDb(row));
    }
  }
  async function deleteCard(id) {
    await _delete('cards', id);
    state.cards = state.cards.filter(c => c.id !== id);
  }

  // ===== INVESTMENTS =====
  async function saveInvestment(inv) {
    if (inv.id) {
      const row = await _update('investments', inv.id, map.inv.toDb(inv));
      const i = state.investments.findIndex(x => x.id === inv.id);
      if (i >= 0) state.investments[i] = map.inv.fromDb(row);
    } else {
      const row = await _insert('investments', map.inv.toDb(inv));
      state.investments.push(map.inv.fromDb(row));
    }
  }
  async function deleteInvestment(id) {
    await _delete('investments', id);
    state.investments = state.investments.filter(i => i.id !== id);
  }

  // ===== GOALS =====
  async function saveGoal(g) {
    if (g.id) {
      const row = await _update('goals', g.id, map.goal.toDb(g));
      const i = state.goals.findIndex(x => x.id === g.id);
      if (i >= 0) state.goals[i] = map.goal.fromDb(row);
    } else {
      const row = await _insert('goals', map.goal.toDb(g));
      state.goals.push(map.goal.fromDb(row));
    }
  }
  async function deleteGoal(id) {
    await _delete('goals', id);
    state.goals = state.goals.filter(g => g.id !== id);
  }

  // ===== HABITS =====
  async function addHabit(name) {
    const row = await _insert('habits', { name });
    state.habits.push(map.habit.fromDb(row));
  }
  async function deleteHabit(id) {
    await _delete('habits', id);
    state.habits = state.habits.filter(h => h.id !== id);
    delete state.habitLog[id];
  }
  async function toggleHabit(habitId, dayOffset) {
    // dayOffset: 0=Mon..6=Sun, semana atual
    const wk = getWeekKey();
    const k = `${wk}-${dayOffset}`;
    if (!state.habitLog[habitId]) state.habitLog[habitId] = {};
    const wasDone = !!state.habitLog[habitId][k];

    // calcula data real
    const monday = new Date();
    monday.setDate(monday.getDate() - isoWeekDay(monday));
    const target = new Date(monday);
    target.setDate(monday.getDate() + dayOffset);
    const dateIso = target.toISOString().slice(0, 10);

    if (wasDone) {
      const { error } = await sb.from('habit_logs')
        .delete().eq('habit_id', habitId).eq('log_date', dateIso);
      if (error) { toast(error.message, 'error'); return; }
      delete state.habitLog[habitId][k];
    } else {
      const { error } = await sb.from('habit_logs')
        .upsert({ habit_id: habitId, log_date: dateIso, user_id: state.user.id });
      if (error) { toast(error.message, 'error'); return; }
      state.habitLog[habitId][k] = true;
    }
    showSaving();
  }

  // ===== FAMILY =====
  async function addFamilyTime(item) {
    const row = await _insert('family_time', map.fam.toDb(item));
    state.familyTime.unshift(map.fam.fromDb(row));
    state.familyTime.sort((a, b) => b.date.localeCompare(a.date));
  }
  async function deleteFamilyTime(id) {
    await _delete('family_time', id);
    state.familyTime = state.familyTime.filter(f => f.id !== id);
  }

  // ===== STUDY =====
  async function saveStudyItem(item) {
    if (item.id) {
      const row = await _update('study_items', item.id, map.study.toDb(item));
      const i = state.studyItems.findIndex(s => s.id === item.id);
      if (i >= 0) state.studyItems[i] = map.study.fromDb(row);
    } else {
      const row = await _insert('study_items', map.study.toDb(item));
      state.studyItems.push(map.study.fromDb(row));
    }
  }
  async function deleteStudyItem(id) {
    await _delete('study_items', id);
    state.studyItems = state.studyItems.filter(s => s.id !== id);
    state.studySessions = state.studySessions.filter(s => s.itemId !== id);
  }
  async function logStudySession(itemId, hours) {
    const row = await _insert('study_sessions', map.sess.toDb({ itemId, hours, date: new Date().toISOString().slice(0, 10) }));
    state.studySessions.push(map.sess.fromDb(row));
  }

  // ===== WORKOUTS =====
  async function saveWorkout(w) {
    const row = await _insert('workouts', map.workout.toDb(w));
    state.workouts.unshift(map.workout.fromDb(row));
    state.workouts.sort((a, b) => b.date.localeCompare(a.date));
  }
  async function deleteWorkout(id) {
    await _delete('workouts', id);
    state.workouts = state.workouts.filter(w => w.id !== id);
  }

  // ===== TRIPS =====
  async function saveTrip(t) {
    if (t.id) {
      const row = await _update('trips', t.id, map.trip.toDb(t));
      const i = state.trips.findIndex(x => x.id === t.id);
      if (i >= 0) state.trips[i] = map.trip.fromDb(row);
    } else {
      const row = await _insert('trips', map.trip.toDb(t));
      state.trips.push(map.trip.fromDb(row));
    }
    state.trips.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  }
  async function deleteTrip(id) {
    await _delete('trips', id);
    state.trips = state.trips.filter(t => t.id !== id);
  }

  // ===== PREFERENCES =====
  async function setPrefs(patch) {
    const dbPatch = {};
    if ('reserve' in patch)      dbPatch.reserve = patch.reserve;
    if ('reserveGoal' in patch)  dbPatch.reserve_goal = patch.reserveGoal;
    if ('familyGoal' in patch)   dbPatch.family_goal = patch.familyGoal;
    if ('workoutGoal' in patch)  dbPatch.workout_goal = patch.workoutGoal;
    const { error } = await sb.from('user_preferences')
      .upsert({ user_id: state.user.id, ...dbPatch }, { onConflict: 'user_id' });
    if (error) { toast(error.message, 'error'); throw error; }
    Object.assign(state, patch);
    showSaving();
  }

  // ===== DAILY METRICS (energy/focus) =====
  async function setDailyMetric(field, value) {
    const date = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from('daily_metrics')
      .upsert({ user_id: state.user.id, date, [field]: value }, { onConflict: 'user_id,date' });
    if (error) { toast(error.message, 'error'); throw error; }
    state[field][date] = value;
    showSaving();
  }

  // ===== IMPORT (do JSON do Artifacts) =====
  // dump tem o shape: { transactions:[], cards:[], investments:[], goals:[], habits:[],
  //                     habitLog:{}, familyTime:[], familyGoal:0, studyItems:[], studySessions:[],
  //                     workouts:[], workoutGoal:0, trips:[], reserve:0, reserveGoal:0,
  //                     energy:{}, focus:{} }
  async function importBackup(dump) {
    if (!dump || typeof dump !== 'object') throw new Error('JSON inválido');
    const uid = state.user.id;
    const stats = { added: 0, errors: 0 };

    // mapeia ID antigo -> ID novo (UUID gerado no banco) pra preservar relação habit↔log e study↔session
    const habitIdMap = {};
    const studyIdMap = {};

    async function bulk(table, rows, opts = {}) {
      if (!rows || !rows.length) return [];
      const { data, error } = await sb.from(table).insert(rows).select();
      if (error) { console.error(table, error); stats.errors += rows.length; return []; }
      stats.added += data.length;
      return data;
    }

    // user_preferences
    if ('reserve' in dump || 'reserveGoal' in dump || 'familyGoal' in dump || 'workoutGoal' in dump) {
      await sb.from('user_preferences').upsert({
        user_id: uid,
        reserve: Number(dump.reserve) || 0,
        reserve_goal: Number(dump.reserveGoal) || 0,
        family_goal: Number(dump.familyGoal) || 0,
        workout_goal: Number(dump.workoutGoal) || 0,
      }, { onConflict: 'user_id' });
    }

    // transactions
    await bulk('transactions', (dump.transactions || []).map(t => ({
      user_id: uid, type: t.type, amount: Number(t.amount) || 0,
      description: t.desc || '(sem descrição)', category: t.category || '',
      occurred_on: t.date || new Date().toISOString().slice(0, 10),
    })));

    // cards
    await bulk('cards', (dump.cards || []).map(c => ({
      user_id: uid, name: c.name || 'Cartão', flag: c.flag || 'VISA',
      due_day: Math.max(1, Math.min(31, Number(c.dueDay) || 1)),
      credit_limit: Number(c.limit) || 0, used: Number(c.used) || 0,
    })));

    // investments
    await bulk('investments', (dump.investments || []).map(i => ({
      user_id: uid, name: i.name || 'Posição',
      type: ['fixed','variable','other'].includes(i.type) ? i.type : 'other',
      amount: Number(i.amount) || 0,
    })));

    // goals
    await bulk('goals', (dump.goals || []).map(g => ({
      user_id: uid, title: g.title || 'Meta',
      category: ['financeira','profissional','pessoal','compra'].includes(g.cat) ? g.cat : 'pessoal',
      deadline: g.deadline || null,
      target: Number(g.target) || 0,
      current_value: Number(g.current) || 0,
      description: g.desc || null,
    })));

    // habits + map de IDs antigos
    const habitsInserted = await bulk('habits',
      (dump.habits || []).map(h => ({ user_id: uid, name: h.name || 'Hábito' }))
    );
    (dump.habits || []).forEach((old, i) => {
      if (habitsInserted[i]) habitIdMap[old.id] = habitsInserted[i].id;
    });

    // habit_logs (converte chave week-day em data real)
    const logRows = [];
    for (const [oldHabitId, weekMap] of Object.entries(dump.habitLog || {})) {
      const newHabitId = habitIdMap[oldHabitId];
      if (!newHabitId) continue;
      for (const [k, done] of Object.entries(weekMap || {})) {
        if (!done) continue;
        const date = weekDayKeyToDate(k);
        if (date) logRows.push({ habit_id: newHabitId, log_date: date, user_id: uid });
      }
    }
    if (logRows.length) {
      const { error } = await sb.from('habit_logs').upsert(logRows);
      if (error) { console.error('habit_logs', error); stats.errors += logRows.length; }
      else stats.added += logRows.length;
    }

    // family_time
    await bulk('family_time', (dump.familyTime || []).map(f => ({
      user_id: uid, occurred_on: f.date || new Date().toISOString().slice(0, 10),
      hours: Number(f.hours) || 0, activity: f.activity || '(sem descrição)',
    })).filter(f => f.hours > 0));

    // study_items + map
    const studiesInserted = await bulk('study_items', (dump.studyItems || []).map(s => ({
      user_id: uid, title: s.title || 'Estudo',
      type: ['curso','livro','certificacao','outro'].includes(s.type) ? s.type : 'outro',
      status: ['andamento','planejado','concluido'].includes(s.status) ? s.status : 'planejado',
      progress: Math.max(0, Math.min(100, Number(s.progress) || 0)),
      total_hours: Number(s.totalHours) || 0,
    })));
    (dump.studyItems || []).forEach((old, i) => {
      if (studiesInserted[i]) studyIdMap[old.id] = studiesInserted[i].id;
    });

    // study_sessions
    await bulk('study_sessions', (dump.studySessions || [])
      .map(s => ({
        user_id: uid, item_id: studyIdMap[s.itemId],
        hours: Number(s.hours) || 0,
        occurred_on: s.date || new Date().toISOString().slice(0, 10),
      }))
      .filter(s => s.item_id && s.hours > 0)
    );

    // workouts
    await bulk('workouts', (dump.workouts || []).map(w => ({
      user_id: uid, occurred_on: w.date || new Date().toISOString().slice(0, 10),
      type: w.type || 'Outro',
      duration_min: Math.max(0, Number(w.duration) || 0),
      intensity: Math.max(1, Math.min(5, Number(w.intensity) || 3)),
    })));

    // trips
    await bulk('trips', (dump.trips || []).map(t => ({
      user_id: uid, title: t.title || 'Plano',
      type: ['viagem','compra','evento'].includes(t.type) ? t.type : 'viagem',
      target_date: t.date || null,
      cost: Number(t.cost) || 0, saved: Number(t.saved) || 0,
      notes: t.notes || null,
    })));

    // daily_metrics (energy + focus)
    const metricsByDate = {};
    for (const [d, v] of Object.entries(dump.energy || {})) metricsByDate[d] = { energy: Number(v) };
    for (const [d, v] of Object.entries(dump.focus  || {})) metricsByDate[d] = { ...(metricsByDate[d] || {}), focus: Number(v) };
    const metricsRows = Object.entries(metricsByDate).map(([date, vals]) => ({
      user_id: uid, date, ...vals,
    }));
    if (metricsRows.length) {
      const { error } = await sb.from('daily_metrics').upsert(metricsRows, { onConflict: 'user_id,date' });
      if (error) { console.error('daily_metrics', error); stats.errors += metricsRows.length; }
      else stats.added += metricsRows.length;
    }

    return stats;
  }

  // ===== EXPORT (backup JSON) =====
  function exportBackup() {
    return {
      exportedAt: new Date().toISOString(),
      transactions: state.transactions,
      cards: state.cards,
      investments: state.investments,
      goals: state.goals,
      habits: state.habits,
      habitLog: state.habitLog,
      familyTime: state.familyTime,
      familyGoal: state.familyGoal,
      studyItems: state.studyItems,
      studySessions: state.studySessions,
      workouts: state.workouts,
      workoutGoal: state.workoutGoal,
      trips: state.trips,
      reserve: state.reserve,
      reserveGoal: state.reserveGoal,
      energy: state.energy,
      focus: state.focus,
    };
  }

  return {
    state, getWeekKey, isoWeekDay,
    loadAll,
    addTransaction, deleteTransaction,
    saveCard, deleteCard,
    saveInvestment, deleteInvestment,
    saveGoal, deleteGoal,
    addHabit, deleteHabit, toggleHabit,
    addFamilyTime, deleteFamilyTime,
    saveStudyItem, deleteStudyItem, logStudySession,
    saveWorkout, deleteWorkout,
    saveTrip, deleteTrip,
    setPrefs, setDailyMetric,
    importBackup, exportBackup,
  };
})();
