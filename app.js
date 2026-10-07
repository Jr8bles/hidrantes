/* Inspección de Hidrantes — PWA
   Guarda cada inspección en el dispositivo y la envía como fila nueva
   a la hoja "Inspecciones" de Google Sheets mediante un script de Apps Script. */
(() => {
  'use strict';
  const C = window.APP_CONFIG;
  const DEMO = !C.SCRIPT_URL || !/^https:\/\/script\.google\.com\//.test(C.SCRIPT_URL);

  // Columnas de la hoja (el script las acomoda según el encabezado real)
  const COLUMNAS = [
    'ID Inspección', 'Fecha', 'Hora', 'Número de Activo', 'Marca', 'Tipo', 'Provincia', 'Cantón', 'Distrito', 'Fijos',
    'Const de Pedestal', 'Repello de pedestal', 'Tornillería', 'Pintura de pedestal', 'Levantamiento de CV',
    'Instalacion de CV', 'Const dado de CV', 'Instalacion de Mamparas', 'Trabajo de soldadura 100mm',
    'Trabajo de soldadura 150mm', 'Sondeo en Asfalto', 'Sondeo en Lastre', 'Sondeo en Concreto', 'Sondeo en Adoquin',
    'Rep. Calzada Asfalto', 'Rep. Calzada Concreto', 'Sustitución de grafito', 'Constru. Muro de Protección',
    'P. Estática (PSI)', 'P. Dinámica (PSI)', 'Caudal (L/min)', 'Observaciones', 'Ubicación GPS', 'Cuadrilla'
  ];

  // ---------- almacenamiento local seguro ----------
  const K = { regs: 'hid.registros', lists: 'hid.listas', sticky: 'hid.fijos', draft: 'hid.borrador', target: 'hid.destino' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio / modo privado */ } },
    del(k) { try { localStorage.removeItem(k); } catch { } }
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('#form');
  let registros = store.get(K.regs, []);
  let listas = Object.assign({}, C.LISTAS, store.get(K.lists, {}));

  // ---------- utilidades ----------
  const pad = n => String(n).padStart(2, '0');
  const fechaISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaISO = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function nuevoId(d) {
    const rnd = (crypto.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 8)).toUpperCase();
    return `INS-${fechaISO(d).replace(/-/g, '')}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${rnd}`;
  }
  let toastT;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- listas desplegables ----------
  function llenarListas() {
    const fijos = store.get(K.sticky, {});
    $$('select[data-list]').forEach(sel => {
      const actual = sel.value || fijos[sel.dataset.col] || '';
      const items = (listas[sel.dataset.list] || []).filter(Boolean);
      sel.innerHTML = '<option value="">Seleccione…</option>' + items.map(v => `<option>${esc(v)}</option>`).join('');
      if (actual && !items.includes(actual)) sel.insertAdjacentHTML('beforeend', `<option>${esc(actual)}</option>`);
      sel.value = actual;
    });
  }

  // ---------- formulario ----------
  function leerFormulario() {
    const v = {};
    $$('[data-col]', form).forEach(el => {
      const col = el.dataset.col;
      if (el.classList.contains('yn')) {
        const r = $('input:checked', el); v[col] = r ? r.value : '';
      } else if (el.hasAttribute('data-num')) {
        v[col] = el.value === '' ? '' : Number(el.value);
      } else {
        v[col] = el.value.trim();
      }
    });
    return v;
  }
  function escribirFormulario(v) {
    $$('[data-col]', form).forEach(el => {
      const col = el.dataset.col;
      if (!(col in v)) return;
      if (el.classList.contains('yn')) {
        $$('input', el).forEach(r => { r.checked = r.value === v[col]; });
      } else el.value = v[col];
    });
  }
  function limpiarFormulario() {
    const fijos = store.get(K.sticky, {});
    form.reset();
    $$('.yn[data-default]', form).forEach(el => { const r = $(`input[value="${el.dataset.default}"]`, el); if (r) r.checked = true; });
    llenarListas();
    $$('select[data-sticky]', form).forEach(s => { if (fijos[s.dataset.col]) s.value = fijos[s.dataset.col]; });
    $$('.invalid', form).forEach(e => e.classList.remove('invalid'));
    $('#gpsInfo').textContent = '';
    store.del(K.draft);
  }
  function validar(v) {
    let primero = null;
    $$('.invalid', form).forEach(e => e.classList.remove('invalid'));
    const marcar = el => { el.classList.add('invalid'); primero = primero || el; };
    $$('[required]', form).forEach(el => { if (!el.value.trim()) marcar(el.closest('.field') || el); });
    $$('.yn[data-required]', form).forEach(el => { if (!v[el.dataset.col]) marcar(el); });
    $$('[data-num]', form).forEach(el => {
      if (el.value === '') return;
      const n = Number(el.value), min = Number(el.min), max = Number(el.max);
      if (!Number.isFinite(n) || n < min || n > max) marcar(el.closest('.field'));
    });
    const gps = v['Ubicación GPS'];
    if (gps && !/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(gps)) marcar($('#gps').closest('.field'));
    if (primero) { primero.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Revisa los campos marcados.'); return false; }
    return true;
  }

  form.addEventListener('input', () => store.set(K.draft, leerFormulario()));
  form.addEventListener('change', e => {
    const el = e.target.closest('.invalid'); if (el) el.classList.remove('invalid');
    const sel = e.target.closest('select[data-sticky]');
    if (sel) { const f = store.get(K.sticky, {}); f[sel.dataset.col] = sel.value; store.set(K.sticky, f); }
    store.set(K.draft, leerFormulario());
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = leerFormulario();
    if (!validar(v)) return;
    const ahora = new Date();
    v['ID Inspección'] = nuevoId(ahora);
    v['Fecha'] = fechaISO(ahora);
    v['Hora'] = horaISO(ahora);
    registros.unshift({ id: v['ID Inspección'], valores: v, estado: DEMO ? 'demo' : 'pendiente', creado: ahora.getTime() });
    guardarRegistros();
    limpiarFormulario();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    capturarGPS();
    toast(DEMO ? 'Guardado en el dispositivo (modo demo).' : navigator.onLine ? 'Guardado. Enviando…' : 'Guardado sin conexión. Se enviará al volver la señal.');
    sincronizar();
  });
  $('#btnLimpiar').addEventListener('click', () => { if (confirmarLimpiar()) { limpiarFormulario(); capturarGPS(); } });
  function confirmarLimpiar() {
    const b = $('#btnLimpiar');
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Limpiar'; return true; }
    b.dataset.armed = '1'; b.textContent = '¿Seguro?';
    setTimeout(() => { delete b.dataset.armed; b.textContent = 'Limpiar'; }, 3000);
    return false;
  }

  // ---------- GPS ----------
  function capturarGPS() {
    const info = $('#gpsInfo'), btn = $('#btnGps');
    if (!('geolocation' in navigator)) { info.textContent = 'Este dispositivo no permite GPS. Escribe la ubicación a mano.'; return; }
    btn.disabled = true; info.textContent = 'Obteniendo ubicación…';
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude: la, longitude: lo, accuracy: ac } = p.coords;
      $('#gps').value = `${la.toFixed(6)}, ${lo.toFixed(6)}`;
      info.textContent = `Precisión aproximada: ±${Math.round(ac)} m` + (ac > 50 ? ' — si puedes, espera unos segundos y vuelve a capturar.' : '');
      btn.disabled = false; store.set(K.draft, leerFormulario());
    }, err => {
      info.textContent = err.code === 1 ? 'Permiso de ubicación denegado. Actívalo en el navegador o escribe la ubicación a mano.' : 'No se pudo obtener la ubicación. Intenta de nuevo al aire libre.';
      btn.disabled = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  $('#btnGps').addEventListener('click', capturarGPS);

  // ---------- registros e historial ----------
  function guardarRegistros() {
    // Conserva todos los no enviados y los últimos 300 enviados
    let enviados = 0;
    registros = registros.filter(r => r.estado !== 'enviado' || ++enviados <= 300);
    store.set(K.regs, registros);
    pintarHistorial();
  }
  const ETQ = { enviado: 'Enviado', pendiente: 'Pendiente', error: 'Reintentará', demo: 'Solo local' };
  function pintarHistorial() {
    const pend = registros.filter(r => r.estado === 'pendiente' || r.estado === 'error').length;
    const b = $('#badge'); b.textContent = pend; b.hidden = pend === 0;
    $('#histResumen').textContent = `${registros.length} registro(s) · ${pend} pendiente(s) de envío`;
    const ul = $('#lista');
    if (!registros.length) { ul.innerHTML = '<li class="vacio">Aún no hay inspecciones en este dispositivo.</li>'; }
    else ul.innerHTML = registros.slice(0, 100).map(r => {
      const v = r.valores;
      return `<li><div><div class="t">${esc(v['Número de Activo'])} · ${esc(v['Marca'])} · ${esc(v['Tipo'])}</div>
        <div class="s">${esc(v['Fecha'])} ${esc(v['Hora'].slice(0, 5))} · ${esc(v['Distrito'])} · ${esc(v['Cuadrilla'])}</div>
        <div class="s">${esc(r.id)}</div>${r.error ? `<div class="e">${esc(r.error)}</div>` : ''}</div>
        <span class="pill ${r.estado}">${ETQ[r.estado] || r.estado}</span></li>`;
    }).join('');
    actualizarEstado();
  }
  $('#btnSync').addEventListener('click', () => {
    if (DEMO) return toast('Modo demo: configura config.js para enviar a la hoja de Google.');
    if (!navigator.onLine) return toast('Sin conexión. Se enviará automáticamente.');
    sincronizar(true);
  });
  $('#btnCsv').addEventListener('click', exportarCSV);
  function exportarCSV() {
    if (!registros.length) return toast('No hay registros para exportar.');
    const dec = (1.1).toLocaleString().charAt(1);
    const sep = dec === ',' ? ';' : ',';
    const q = s => { s = String(s ?? ''); if (/^[=+@]/.test(s)) s = "'" + s; return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const filas = [COLUMNAS.map(q).join(sep)].concat(registros.slice().reverse().map(r =>
      COLUMNAS.map(c => { const x = r.valores[c]; return q(typeof x === 'number' ? String(x).replace('.', dec) : x); }).join(sep)));
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `inspecciones_${fechaISO(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- pestañas ----------
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
    $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
    document.body.classList.toggle('en-historial', t.dataset.tab === 'historial');
    $('.submitbar').hidden = t.dataset.tab !== 'nueva';
  }));

  // ---------- estado de conexión ----------
  function actualizarEstado() {
    const e = $('#estado'), pend = registros.filter(r => r.estado === 'pendiente' || r.estado === 'error').length;
    const on = navigator.onLine;
    e.classList.toggle('online', on); e.classList.toggle('offline', !on);
    let txt = DEMO ? 'Modo demo' : on ? 'En línea' : 'Sin conexión';
    if (sincronizando) txt = 'Enviando…';
    if (pend) txt += ` · ${pend} pendiente${pend > 1 ? 's' : ''}`;
    $('#estadoTxt').textContent = txt;
  }
  window.addEventListener('online', () => { actualizarEstado(); sincronizar(); });
  window.addEventListener('offline', actualizarEstado);

  // ---------- envío a Google Sheets (Apps Script) ----------
  async function llamar(url, opciones) {
    let r;
    try { r = await fetch(url, Object.assign({ redirect: 'follow' }, opciones)); }
    catch (e) { const x = new Error('Sin conexión con Google.'); x.red = true; throw x; }
    if (!r.ok) throw new Error(`Error ${r.status} del servidor de Google.`);
    let j;
    try { j = await r.json(); }
    catch (e) { throw new Error('Respuesta inesperada. Revisa que el script esté implementado con acceso "Cualquier usuario".'); }
    if (!j.ok) throw new Error(j.error || 'Error del script.');
    return j;
  }
  async function cargarListas() {
    try {
      const j = await llamar(`${C.SCRIPT_URL}?accion=listas&clave=${encodeURIComponent(C.CLAVE)}`);
      if (j.listas && Object.keys(j.listas).length) { listas = Object.assign({}, C.LISTAS, j.listas); store.set(K.lists, j.listas); llenarListas(); }
    } catch (e) { /* se usan las listas guardadas o de respaldo */ }
  }

  let sincronizando = false, listasCargadas = false;
  async function sincronizar(manual) {
    if (DEMO || sincronizando) return;
    if (!navigator.onLine) { actualizarEstado(); return; }
    if (!listasCargadas) { listasCargadas = true; cargarListas(); }
    const pend = registros.filter(r => r.estado === 'pendiente' || r.estado === 'error').reverse(); // más antiguos primero
    if (!pend.length) { if (manual) toast('Todo está al día.'); return; }
    sincronizando = true; actualizarEstado(); $('#btnSync').disabled = true;
    let ok = 0;
    try {
      for (let i = 0; i < pend.length; i += 20) {
        const lote = pend.slice(i, i + 20);
        try {
          const j = await llamar(C.SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la verificación CORS previa
            body: JSON.stringify({ clave: C.CLAVE, registros: lote.map(r => r.valores) })
          });
          const g = new Set(j.guardados || []);
          lote.forEach(r => { if (g.has(r.id)) { r.estado = 'enviado'; r.error = null; r.enviado = Date.now(); ok++; } });
        } catch (e) {
          lote.forEach(r => { r.estado = 'error'; r.error = e.message; });
          guardarRegistros();
          if (manual || !e.red) toast('No se pudo enviar: ' + e.message, 6000);
          break;
        }
        guardarRegistros();
      }
      if (ok) toast(`${ok} inspección(es) agregada(s) a la hoja de Google.`);
    } finally {
      sincronizando = false; $('#btnSync').disabled = false; guardarRegistros();
    }
  }

  // ---------- instalación ----------
  let promptInstalar = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; $('#btnInstalar').hidden = false; });
  $('#btnInstalar').addEventListener('click', async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; $('#btnInstalar').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btnInstalar').hidden = true; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }

  // ---------- inicio ----------
  async function inicio() {
    $('#bannerDemo').hidden = !DEMO;
    limpiarFormulario();
    const borrador = store.get(K.draft, null);
    if (borrador) { escribirFormulario(borrador); store.set(K.draft, borrador); }
    pintarHistorial();
    if (!borrador || !borrador['Ubicación GPS']) capturarGPS();
    sincronizar();
    setInterval(() => { if (registros.some(r => r.estado === 'pendiente' || r.estado === 'error')) sincronizar(); }, 60000);
  }
  inicio();
})();
