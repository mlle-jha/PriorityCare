'use strict';

// PriorityCare - Preemptive Priority Scheduling
// Lower number = higher priority.

const PR = {
  1: ['Critical', 'Immediate treatment'],
  2: ['Urgent', 'Requires prompt treatment'],
  3: ['Moderate', 'Can wait for a short period'],
  4: ['Minor', 'Lowest priority']
};

const $ = id => document.getElementById(id);

const esc = s => String(s).replace(/[&<>"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[c]));

const pad = n => String(n).padStart(2, '0');

const col = n => `var(--P${n})`;
const fg = n => n === 3 ? '#2b2b2b' : '#fff';
const KEY = 'prioritycare.v1';

// Simulation state

const blank = (speed = 5) => ({
  now: 0,
  pts: [],
  run: null,
  gantt: [],
  log: [],
  pre: 0,
  speed
});

let S = blank();
let tm = null;
let shown = null;
let aT = null;

const rowEl = {};
const lastSt = {};

// Save simulation state

const save = () => {
  try {
    S.log = S.log.slice(-300);
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    // Continue even if browser storage is unavailable.
  }
};

// Clear displayed patient information

function clearView() {
  Object.keys(rowEl).forEach(k => {
    rowEl[k].remove();
    delete rowEl[k];
    delete lastSt[k];
  });

  shown = null;
  $('bed').innerHTML = '';
  $('pnote').innerHTML = '';
}

// Patient management

function addPatient(id, name, at, bt, pr) {
  S.pts.push({
    n: S.pts.length,
    id,
    name: name || ('Patient ' + id),
    at,
    bt,
    rem: bt,
    pr,
    first: null,
    ct: null
  });
}

function nextId() {
  let n = S.pts.length + 1;
  let id;

  do {
    id = 'P' + String(n++).padStart(3, '0');
  } while (
    S.pts.some(p => p.id.toLowerCase() === id.toLowerCase())
  );

  return id;
}

// Patient status

function status(p) {
  if (p.ct !== null) return 'COMPLETED';
  if (p.at > S.now) return 'NOT ARRIVED';
  if (p.id === S.run) return 'TREATING';

  return p.first !== null ? 'PREEMPTED' : 'WAITING';
}

// Preemptive Priority Scheduling
// One time unit is executed per step.

function step() {
  const t = S.now;
  const L = [];

  const lg = (m, at = t) => {
    L.push(`[${pad(at)}] ${m}`);
  };

  let ev = null;

  // 1. Detect arriving patients.

  S.pts.filter(p => p.at === t).forEach(p => {
    lg(`${p.id} arrived`);
  });

  // 2. Build the ready queue.
  // Lower priority number is more important.
  // Ties use earlier arrival, then entry order.

  const ready = S.pts
    .filter(p => p.at <= t && p.rem > 0)
    .sort((a, b) =>
      a.pr - b.pr ||
      a.at - b.at ||
      a.n - b.n
    );

  const cur = S.pts.find(
    p => p.id === S.run && p.rem > 0
  ) || null;

  let next = ready[0] || null;

  // 3. Preempt only if a strictly higher-priority
  // patient is ready.

  if (cur && next && cur.pr <= next.pr) {
    next = cur;
  }

  if (next) {
    if (cur && next !== cur) {
      ev = {
        from: cur,
        to: next
      };

      S.pre++;

      lg(`${next.id} has higher priority than ${cur.id}`);
      lg(`${cur.id} PREEMPTED`);
    }

    if (next !== cur) {
      lg(
        `${next.id} ${
          next.first === null ? 'started' : 'resumed'
        } treatment`
      );
    }

    // Record the first time treatment begins.

    if (next.first === null) {
      next.first = t;
    }

    // 4. Execute one time unit.

    next.rem--;

    // 5. Check completion.

    if (next.rem === 0) {
      next.ct = t + 1;

      lg(`${next.id} completed`, t + 1);

      if (!S.pts.some(p => p.rem > 0)) {
        lg('ALL PATIENTS COMPLETED', t + 1);
      }
    }
  } else if (
    S.run !== null &&
    S.pts.some(p => p.rem > 0)
  ) {
    lg('Doctor idle: waiting for the next arrival');
  }

  // Record the Gantt chart and advance the clock.

  S.gantt.push(next ? next.id : null);
  S.run = next ? next.id : null;
  S.now++;

  S.log.push(...L);

  return ev;
}

// Simulation controls

function toast(m, type) {
  const a = $('al');

  a.textContent = m;
  a.className = 'alert show' + (type ? ' ' + type : '');

  clearTimeout(aT);

  aT = setTimeout(() => {
    a.className = 'alert';
  }, 3600);
}

const unfinished = () => S.pts.some(p => p.rem > 0);

function setBtns() {
  $('bStart').disabled = !!tm;
  $('bPause').disabled = !tm;
}

function tick() {
  const ev = step();

  drawAll(ev);
  save();

  if (ev) {
    toast(
      `${ev.from.id} was interrupted because ` +
      `${ev.to.id} has a higher priority.`
    );
  }

  if (!unfinished()) {
    stopT();
    toast('All patients completed.', 'ok');
  }
}

function startT() {
  if (!S.pts.length) {
    return toast('Add at least one patient first.', 'err');
  }

  if (!unfinished()) {
    return toast(
      'All patients are already completed. Use REPLAY, RESET or add a patient.',
      'err'
    );
  }

  if (tm) return;

  tm = setInterval(tick, 1400 - S.speed * 130);

  setBtns();
}

function stopT() {
  clearInterval(tm);
  tm = null;

  setBtns();
}

function resetAll() {
  stopT();

  S = blank(S.speed);

  clearView();

  $('fid').value = nextId();
  $('fat').value = 0;

  drawAll();
  save();
}

function replay() {
  stopT();

  S.pts.forEach(p => {
    p.rem = p.bt;
    p.first = null;
    p.ct = null;
  });

  Object.assign(S, {
    now: 0,
    run: null,
    gantt: [],
    log: [],
    pre: 0
  });

  clearView();

  $('fat').value = 0;

  drawAll();
  save();
}

function sample() {
  resetAll();

  addPatient('P001', 'Juan', 0, 8, 3);
  addPatient('P002', 'Maria', 2, 4, 1);
  addPatient('P003', 'Pedro', 4, 3, 2);

  $('fid').value = nextId();

  drawAll();
  save();
}

function submitPatient() {
  const id = $('fid').value.trim();
  const name = $('fnm').value.trim();
  const at = Number($('fat').value);
  const bt = Number($('fbt').value);
  const pr = Number($('fpr').value);

  if (!/^[A-Za-z0-9_-]{1,10}$/.test(id)) {
    return toast(
      'Patient ID: use 1 to 10 letters, numbers, - or _.',
      'err'
    );
  }

  if (
    S.pts.some(p => p.id.toLowerCase() === id.toLowerCase())
  ) {
    return toast(`Patient ID ${id} already exists.`, 'err');
  }

  if (!Number.isInteger(at) || at < 0) {
    return toast(
      'Arrival time must be a whole number, 0 or more.',
      'err'
    );
  }

  if (at < S.now) {
    return toast(
      `Arrival time cannot be earlier than the current time (${S.now}).`,
      'err'
    );
  }

  if (!Number.isInteger(bt) || bt < 1 || bt > 240) {
    return toast(
      'Treatment time must be a whole number from 1 to 240.',
      'err'
    );
  }

  addPatient(id, name, at, bt, pr);

  $('fnm').value = '';
  $('fid').value = nextId();
  $('fat').value = S.now;

  drawAll();
  save();
}

// Export CSV without Response Time (RT).

function exportCsv() {
  const rows = [
    [
      'Patient ID',
      'Name',
      'Priority',
      'AT',
      'BT',
      'CT',
      'TAT',
      'WT'
    ]
  ];

  S.pts.filter(p => p.ct !== null).forEach(p => {
    const tat = p.ct - p.at;

    rows.push([
      p.id,
      p.name,
      p.pr,
      p.at,
      p.bt,
      p.ct,
      tat,
      tat - p.bt
    ]);
  });

  if (rows.length < 2) {
    return toast(
      'No completed patients to export yet.',
      'err'
    );
  }

  const csv = rows.map(r =>
    r.map(x =>
      `"${String(x).replace(/"/g, '""')}"`
    ).join(',')
  ).join('\n');

  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;'
    })
  );

  const a = document.createElement('a');

  a.href = url;
  a.download = 'prioritycare-results.csv';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Connect controls.

$('bStart').onclick = startT;
$('bPause').onclick = stopT;

$('bStep').onclick = () => {
  stopT();

  if (!S.pts.length) {
    return toast('Add at least one patient first.', 'err');
  }

  if (!unfinished()) {
    return toast('All patients are already completed.', 'err');
  }

  tick();
};

$('bReset').onclick = () => {
  if (
    !S.pts.length ||
    confirm(
      'RESET clears all patients and returns to the initial state. Continue?'
    )
  ) {
    resetAll();
  }
};

$('bReplay').onclick = replay;
$('bSample').onclick = sample;
$('bCsv').onclick = exportCsv;
$('bAdd').onclick = submitPatient;

$('spd').oninput = e => {
  S.speed = +e.target.value;

  if (tm) {
    stopT();
    startT();
  }

  save();
};

// Draw patient queue.

function drawQ() {
  const key = p => {
    const s = status(p);

    if (s === 'TREATING') return [0, 0, 0];

    if (s === 'WAITING' || s === 'PREEMPTED') {
      return [1, p.pr, p.at];
    }

    if (s === 'NOT ARRIVED') {
      return [2, p.at, 0];
    }

    return [3, p.ct, 0];
  };

  const order = S.pts.slice().sort((a, b) => {
    const x = key(a);
    const y = key(b);

    return (
      x[0] - y[0] ||
      x[1] - y[1] ||
      x[2] - y[2] ||
      a.n - b.n
    );
  });

  const body = $('qb');

  order.forEach(p => {
    const st = status(p);

    let e = rowEl[p.id];

    if (!e) {
      e = rowEl[p.id] = document.createElement('tr');
      e.className = 'in';
    }

    e.style.setProperty('--c', col(p.pr));

    e.innerHTML = `
      <td>${esc(p.id)}</td>
      <td>${esc(p.name)}</td>
      <td>${p.at}</td>
      <td>
        <span class="tag"
          style="--c:${col(p.pr)};--f:${fg(p.pr)}">
          <i>${p.pr}</i>${PR[p.pr][0]}
        </span>
      </td>
      <td>${p.rem} / ${p.bt}</td>
      <td>
        <span class="stt s${st.replace(' ', '')}">
          ${st}
        </span>
      </td>
    `;

    if (lastSt[p.id] && lastSt[p.id] !== st) {
      const f = st === 'PREEMPTED'
        ? 'flP'
        : st === 'TREATING'
          ? 'flT'
          : st === 'COMPLETED'
            ? 'flC'
            : '';

      e.classList.remove('flP', 'flT', 'flC');

      if (f) {
        void e.offsetWidth;
        e.classList.add(f);
      }
    }

    lastSt[p.id] = st;

    body.appendChild(e);
  });

  const cnt = s =>
    S.pts.filter(p => status(p) === s).length;

  $('c1').textContent = cnt('WAITING');
  $('c2').textContent = cnt('PREEMPTED');
  $('c3').textContent = cnt('TREATING');
  $('c4').textContent = cnt('COMPLETED');

  $('qn').textContent = S.pts.length
    ? S.pts.length + ' patients'
    : '';
}

// Draw current patient.

function drawBay(ev) {
  const p = S.pts.find(x => x.id === S.run);
  const bed = $('bed');
  const bay = $('bay');

  if (!p) {
    shown = null;

    bed.innerHTML =
      '<div class="free">NO PATIENT BEING TREATED</div>';

    $('ecg').className = 'ecg off';
    $('pb').style.width = '0';
    $('pp').textContent = '0%';
    $('pnote').innerHTML = '';

    return;
  }

  if (shown !== p.id) {
    shown = p.id;
    bed.innerHTML = '<div class="cp in" id="cp"></div>';
  }

  const c = $('cp');
  const done = p.rem === 0;
  const pct = Math.round(
    ((p.bt - p.rem) / p.bt) * 100
  );

  c.style.setProperty('--c', col(p.pr));
  c.style.setProperty('--f', fg(p.pr));

  c.innerHTML = `
    <span class="lv">${p.pr}</span>
    <div class="nm">
      <b>${esc(p.id)} · ${esc(p.name)}</b>
      <small>Emergency level: ${p.pr} - ${PR[p.pr][0]}</small>
      <small>${done ? 'COMPLETED' : 'TREATING'}</small>
    </div>
    <div class="rm">
      <b>${p.rem}</b>
      <small>remaining time</small>
    </div>
  `;

  $('ecg').className = 'ecg' + (done ? ' off' : '');
  $('pb').style.width = pct + '%';
  $('pp').textContent = pct + '%';

  if (ev) {
    $('pnote').innerHTML = `
      <div class="a">
        NEW PRIORITY ${ev.to.pr} PATIENT ARRIVES: ${esc(ev.to.id)}
      </div>
      <div class="b">${esc(ev.from.id)} PREEMPTED</div>
      <div class="c">${esc(ev.to.id)} TREATING</div>
      <div class="e">
        ${esc(ev.from.id)} was interrupted because
        ${esc(ev.to.id)} has a higher priority.
        It returns to the queue with ${ev.from.rem}
        time unit(s) remaining.
      </div>
    `;

    bay.classList.remove('bump');

    void bay.offsetWidth;

    bay.classList.add('bump');
  } else {
    $('pnote').innerHTML = '';
  }
}

// Draw Gantt chart.

function drawG() {
  const seg = [];

  S.gantt.forEach((id, i) => {
    const l = seg[seg.length - 1];

    if (l && l.id === id) {
      l.n++;
    } else {
      seg.push({
        id,
        n: 1,
        t: i
      });
    }
  });

  $('g').innerHTML = seg.map((s, i) => {
    const p = S.pts.find(x => x.id === s.id);

    const style = p
      ? `;background:${col(p.pr)};color:${fg(p.pr)}`
      : '';

    return `
      <div
        class="sg${i === seg.length - 1 ? ' new' : ''}"
        style="width:${s.n * 36}px${style}"
        title="${p ? esc(p.id) : 'idle'}: ${s.t}-${s.t + s.n}">
        <b>${p ? esc(p.id) : 'IDLE'}</b>
        <i>${s.t}</i>
      </div>
    `;
  }).join('') + (
    seg.length
      ? `<div class="sg end"><i>${S.gantt.length}</i></div>`
      : ''
  );

  $('g').scrollLeft = 1e6;

  $('sum').textContent = seg.map(s =>
    `${s.t}-${s.t + s.n}: ${s.id || 'IDLE'}`
  ).join('   ');
}

// Draw results without RT.

function drawR() {
  const done = S.pts.filter(p => p.ct !== null);

  let h = S.pts.map(p => {
    const d = p.ct !== null;
    const tat = d ? p.ct - p.at : '';

    return `
      <tr>
        <td>${esc(p.id)}</td>
        <td>${p.at}</td>
        <td>${p.bt}</td>
        <td>${p.pr}</td>
        ${d
          ? `
            <td>${p.ct}</td>
            <td>${tat}</td>
            <td>${tat - p.bt}</td>
          `
          : `
            <td>-</td>
            <td>-</td>
            <td>-</td>
          `
        }
      </tr>
    `;
  }).join('');

  if (done.length) {
    const a = f => (
      done.reduce((s, p) => s + f(p), 0) /
      done.length
    ).toFixed(2);

    h += `
      <tr class="avg">
        <td colspan="5">Average (${done.length} completed)</td>
        <td>${a(p => p.ct - p.at)}</td>
        <td>${a(p => p.ct - p.at - p.bt)}</td>
      </tr>
    `;
  }

  $('rb').innerHTML = h;
}

// Draw event log.

function drawLog() {
  $('log').innerHTML = S.log.map(l => `
    <div class="${
      /PREEMPTED|higher priority/.test(l)
        ? 'pre'
        : /ALL PATIENTS/.test(l)
          ? 'ok'
          : ''
    }">${esc(l)}</div>
  `).join('');

  $('log').scrollTop = 1e6;
}

// Refresh all interface components.

function drawAll(ev) {
  $('clk').textContent = pad(S.now);
  $('fat').min = S.now;

  drawQ();
  drawBay(ev);
  drawG();
  drawR();
  drawLog();
  setBtns();
}

// Initialize simulation.

try {
  const v = JSON.parse(localStorage.getItem(KEY));

  if (
    v &&
    Array.isArray(v.pts) &&
    v.pts.length &&
    Number.isFinite(v.now) &&
    Number.isFinite(v.speed) &&
    v.pts.every(p =>
      typeof p.id === 'string' &&
      Number.isFinite(p.at) &&
      Number.isFinite(p.bt) &&
      Number.isFinite(p.rem) &&
      Number.isFinite(p.pr)
    )
  ) {
    S = v;
  }
} catch (e) {
  // Start a fresh simulation if saved data is invalid.
}

$('spd').value = S.speed;

if (S.pts.length) {
  $('fid').value = nextId();
  $('fat').value = S.now;

  drawAll();
} else {
  sample();
}
