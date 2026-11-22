(() => {
  const root = document.getElementById('gym-preview');
  const find = selector => root.querySelector(selector);
  const tabs = [...root.querySelectorAll('[data-tab]')];
  const seed = 'Press de pecho';
  const catalog = [
    seed, 'Peso muerto', 'Remo con barra', 'Remo TRX', 'Remo con mancuerna unilateral',
    'Flexiones', 'Sit up', 'Hollow rock', 'Toes to bar', 'Push press', 'Push estricto',
    'Squad', 'Squad frontal', 'Squad unilateral', 'Squad box', 'Squad ball', 'Squad air',
    'Lunges', 'Swing', 'Snatch', 'Bíceps', 'Tríceps'
  ];
  const nameKey = name => name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  const references = [[60, 4, 6, 2], [55, 6], [47.5, 8], [42.5, 10]];
  const storageKey = 'diario-gimnasio-v1';
  const status = find('#gym-status');
  const fresh = () => ({names: [...catalog], sessions: [], settings: {}, current: seed});
  let state = fresh();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      const existing = new Set(saved.names.map(nameKey));
      state = {...saved, names: [...saved.names, ...catalog.filter(name => !existing.has(nameKey(name)))]};
    }
  } catch {
    status.textContent = 'El navegador no pudo leer los datos guardados.';
  }
  function persist(next) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      state = next;
      return true;
    } catch {
      status.textContent = 'El navegador no pudo guardar los cambios.';
      return false;
    }
  }
  function open(id) {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === id;
      tab.setAttribute('aria-pressed', String(active));
      find('#' + tab.dataset.tab).hidden = !active;
    });
  }
  tabs.forEach(tab => tab.addEventListener('click', () => open(tab.dataset.tab)));
  const picker = find('#gym-exercise');
  const plan = find('#gym-plan');
  const log = find('#gym-log');
  const quickSetCount = 6;
  const kg = weight => weight.toLocaleString('es-ES', {maximumFractionDigits: 3}) + ' kg';
  function today() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const recent = () => state.sessions.filter(session => session.exercise === state.current).slice().reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
  const reserveNumber = answer => answer === 'yes' ? 1 : ['0', '1', '2', '3'].includes(answer) ? Number(answer) : null;
  const capacity = (weight, reps, reserve) => weight * (1 + Math.max(0, reps + (reserve ?? 2) - 2) / 30);
  const effectiveSets = session => {
    const sets = session.sets.filter(set => !set.warm);
    return sets.map((set, index) => ({
      ...set,
      reserve: reserveNumber(set.reserve) ?? (index === sets.length - 1 ? session.rir ?? null : null)
    }));
  };
  function calculate() {
    const {series, reps, step, min} = plan.elements;
    const count = series.valueAsNumber, target = reps.valueAsNumber;
    const increment = step.valueAsNumber, minimum = min.valueAsNumber;
    if (!plan.checkValidity()) return;
    const snap = weight => minimum + Math.floor((weight - minimum) / increment + 1e-8) * increment;
    const history = recent().map(session => ({...session, sets: effectiveSets(session)}));
    const latest = history[0];
    const age = date => Math.max(0, (Date.parse(today()) - Date.parse(date)) / 86400000);
    let weight;
    if (latest && age(latest.date) <= 42 && (latest.assumedEffectiveSets ?? latest.sets.length) >= count && latest.sets.every(set => set.reps === target)) {
      const measured = latest.sets.slice(-2).filter(set => set.reserve !== null);
      const baseline = Math.min(...latest.sets.map(set => set.weight));
      const adjusted = measured.map(set => capacity(set.weight, set.reps, set.reserve) / (1 + target / 30));
      if (measured.length < Math.min(2, latest.sets.length)) adjusted.push(baseline);
      weight = Math.min(...adjusted, baseline + increment);
    } else if (!latest && state.current === seed && target === 4 && count <= 6) {
      weight = references[0][0];
    } else {
      const inputs = history.flatMap(session => {
        const usable = session.sets.filter(set => set.reps <= 15);
        if (!usable.length) return [];
        const measured = usable.filter(set => set.reserve !== null);
        const relevant = measured.length ? measured : usable;
        const closest = relevant.reduce((best, set) => Math.abs(set.reps - target) < Math.abs(best.reps - target) ? set : best);
        return [[Math.min(...relevant.map(set => capacity(set.weight, set.reps, set.reserve))), closest.reps, session.assumedEffectiveSets ?? session.sets.length, age(session.date)]];
      });
      if (!inputs.length && state.current === seed) {
        references.forEach(([load, repetitions, sets, reserve]) => inputs.push([capacity(load, repetitions, reserve), repetitions, sets || 1, 0]));
      }
      let sum = 0, scale = 0;
      for (const [strength, recorded, sets, days] of inputs) {
        const factor = 1 / ((1 + days / 21) * (1 + Math.abs(recorded - target)));
        sum += factor * strength / (1 + target / 30) * Math.max(.85, 1 - .025 * Math.max(0, count - sets));
        scale += factor;
      }
      weight = scale ? sum / scale : NaN;
    }
    weight = snap(weight);
    const valid = Number.isFinite(weight) && weight >= minimum && weight > 0;
    find('#gym-weight').textContent = valid ? kg(weight) : 'Sin propuesta';
    find('#gym-count').textContent = valid ? count + ' × ' + target : 'Registra series efectivas o revisa el peso mínimo.';
    const warm = valid ? [...new Set([.5, .65, .8].map(f => Math.max(minimum, snap(weight * f))))].filter(w => w < weight && w > 0) : [];
    find('#gym-warms').replaceChildren(...warm.map(w => {
      const row = document.createElement('li');
      const reps = document.createElement('span');
      const load = document.createElement('b');
      reps.textContent = '2 × ' + target;
      load.textContent = kg(w);
      row.append(reps, load);
      return row;
    }));
  }
  plan.addEventListener('submit', event => {
    event.preventDefault();
    const {step, min, rest} = plan.elements;
    persist({...state, settings: {...state.settings, [state.current]: [step.value, min.value, rest.value]}});
    calculate();
  });
  function resetForm() {
    log.reset();
    const last = recent()[0]?.sets.findLast(set => !set.warm);
    log.elements.weight.value = last?.weight ?? (state.current === seed ? references[0][0] : '');
    log.elements.reps.value = last?.reps ?? (state.current === seed ? 4 : '');
  }
  log.addEventListener('submit', event => {
    event.preventDefault();
    const {weight, reps, reserve} = log.elements;
    const set = {weight: weight.valueAsNumber, reps: reps.valueAsNumber, warm: false};
    if (reserve.value) set.reserve = reserve.value;
    const session = {
      exercise: state.current,
      date: today(),
      sets: [set],
      assumedEffectiveSets: quickSetCount,
      rir: reserveNumber(set.reserve)
    };
    if (!persist({...state, sessions: [...state.sessions, session]})) return;
    status.textContent = 'Sesión guardada.';
    resetForm();
    renderHistory();
    calculate();
    open('historial');
  });
  const reserveLabel = answer => answer === 'yes' ? 'Sí, sin precisar' : answer === '3' ? '3 o más' : answer;
  function renderHistory() {
    const entries = recent().map(session => {
      const article = document.createElement('article');
      article.className = 'result';
      const date = document.createElement('b');
      date.textContent = session.date.split('-').reverse().join('/');
      article.append(date);
      session.sets.forEach(set => {
        const line = document.createElement('span');
        line.textContent = (session.assumedEffectiveSets ? session.assumedEffectiveSets + ' series estimadas · ' : set.warm ? 'Aprox. · ' : 'Efectiva · ') + kg(set.weight) + ' × ' + set.reps + (set.reserve ? ' · En reserva: ' + reserveLabel(set.reserve) : '');
        article.append(line);
      });
      if (session.rir != null && !session.sets.some(set => set.reserve)) article.append('Última efectiva · ' + session.rir + ' en reserva');
      return article;
    });
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Todavía no hay sesiones con fecha.';
      entries.push(empty);
    }
    find('#gym-entries').replaceChildren(...entries);
    find('#gym-reference').hidden = state.current !== seed;
  }
  function refresh() {
    picker.replaceChildren(...state.names.map(name => new Option(name, name)));
    picker.value = state.current;
    const [step, min, rest] = Object.hasOwn(state.settings, state.current) ? state.settings[state.current] : ['2.5', state.current === seed ? '20' : '0', '60'];
    plan.elements.step.value = step;
    plan.elements.min.value = min;
    plan.elements.rest.value = rest;
    resetForm();
    renderHistory();
    calculate();
    if (!timer) restButton.textContent = 'Iniciar descanso · ' + clockText(Number(rest));
  }
  picker.addEventListener('change', () => {
    status.textContent = '';
    persist({...state, current: picker.value});
    refresh();
  });
  find('#gym-new').addEventListener('click', () => {
    const name = window.prompt('Nombre del ejercicio')?.trim();
    if (!name) return;
    if (state.names.some(existing => nameKey(existing) === nameKey(name))) {
      status.textContent = 'Ese ejercicio ya está en la lista.';
      return;
    }
    if (!persist({...state, names: [...state.names, name], current: name})) return;
    status.textContent = 'Ejercicio añadido.';
    refresh();
  });
  const restButton = find('#gym-rest');
  let timer;
  const clockText = seconds => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  restButton.addEventListener('click', () => {
    if (!plan.elements.rest.reportValidity()) return;
    clearInterval(timer);
    const end = Date.now() + plan.elements.rest.valueAsNumber * 1000;
    function tick() {
      const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      restButton.textContent = seconds ? 'Reiniciar descanso · ' + clockText(seconds) : 'Descanso terminado · Reiniciar';
      if (!seconds) { clearInterval(timer); timer = undefined; }
    }
    timer = setInterval(tick, 250);
    tick();
  });
  const csv = value => {
    const text = String(value ?? '');
    const safe = /^[=+@\-\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  find('#gym-export').addEventListener('click', () => {
    const data = [['fecha', 'ejercicio', 'sesión', 'serie', 'tipo', 'kg', 'repeticiones', 'rir_última_efectiva', 'reserva_serie', 'series_efectivas_asumidas']];
    references.forEach(([weight, reps, count, rir], index) => {
      for (let n = 1; n <= (count || 1); n++) data.push(['', seed, 'ejemplo-' + (index + 1), count ? n : '', 'ejemplo', weight, reps, n === count ? rir : '', n === count ? rir : '', '']);
    });
    state.sessions.forEach((session, index) => {
      const last = session.sets.findLastIndex(set => !set.warm);
      session.sets.forEach((set, n) => data.push([session.date, session.exercise, index + 1, session.assumedEffectiveSets ?? n + 1, set.warm ? 'aproximación' : 'efectiva', set.weight, set.reps, n === last ? session.rir : '', reserveLabel(set.reserve) ?? (n === last ? session.rir : ''), session.assumedEffectiveSets ?? '']));
    });
    const url = URL.createObjectURL(new Blob(['\ufeff' + data.map(row => row.map(csv).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'historial-gimnasio.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  refresh();
})();
