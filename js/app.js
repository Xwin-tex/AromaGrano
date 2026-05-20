// ══════════════════════════════════════════════
//  BASE DE DATOS PERSISTENTE — window.storage
// ══════════════════════════════════════════════

// Cache en memoria para acceso síncrono en el resto del código
const _cache = {};

const DB = {
  // Síncrono: lee desde cache en memoria
  get(k) {
    return (k in _cache) ? _cache[k] : null;
  },
  // Síncrono en memoria + persiste asíncronamente
  set(k, v) {
    _cache[k] = v;
    if (window.storage) {
      window.storage.set('ag_' + k, JSON.stringify(v)).catch(e => console.warn('DB.set error:', k, e));
    }
  },
  init(k, v) {
    if (!(k in _cache)) this.set(k, v);
  },
  // Carga inicial desde storage persistente
  async load(k, fallback) {
    if (window.storage) {
      try {
        const res = await window.storage.get('ag_' + k);
        _cache[k] = res ? JSON.parse(res.value) : fallback;
      } catch(e) {
        _cache[k] = fallback;
      }
    } else {
      // Fallback a localStorage si no hay window.storage
      try { _cache[k] = JSON.parse(localStorage.getItem('ag_' + k)) ?? fallback; }
      catch(e) { _cache[k] = fallback; }
    }
    return _cache[k];
  }
};

const DEFAULT_USERS = [
  { id:'u1', email:'sofia@grano.co',  pass:'123456',   name:'Sofía Martínez', role:'client', pts:260, avatar:'☕' },
  { id:'u2', email:'carlos@grano.co', pass:'cafe2024', name:'Carlos Vélez',   role:'client', pts:185, avatar:'🫗' },
  { id:'u3', email:'admin@grano.co',  pass:'admin123', name:'Administrador',  role:'admin',  pts:0,   avatar:'⚙️' },
];
const DEFAULT_MENU = [
  { id:1, name:'Espresso Etiopía',   origin:'Yirgacheffe · Lavado', cat:'espresso', emoji:'☕', price:9500,  notes:['Durazno','Jazmín','Cítrico'],        desc:'Proceso lavado de altura. Claridad absoluta en taza.', bg:'#2C1A0E' },
  { id:2, name:'Latte Colombia',     origin:'Huila · Natural',       cat:'espresso', emoji:'🥛', price:11000, notes:['Caramelo','Nuez','Achocolatado'],     desc:'Blend de la familia Restrepo en Pitalito. Dulzor natural destacado.', bg:'#3D2412' },
  { id:3, name:'Cold Brew 24h',      origin:'Blend Casa',            cat:'cold',     emoji:'🧊', price:10500, notes:['Chocolate negro','Bajo ácido','Sedoso'],desc:'Extracción en frío 24h. Sin amargor.', bg:'#1A2C3D' },
  { id:4, name:'Nitro Cold Brew',    origin:'Blend Especial',        cat:'cold',     emoji:'🫧', price:13500, notes:['Cremoso','Caramelo','Efervescente'],  desc:'Cold Brew con nitrógeno. Textura de terciopelo.', bg:'#2A1A3D' },
  { id:5, name:'V60 Filtrado',       origin:'Kenya AA',              cat:'filter',   emoji:'🫗', price:14000, notes:['Frutos rojos','Intenso','Winey'],      desc:'Kenya de doble fermentación. Alta complejidad.', bg:'#1A3D1A' },
  { id:6, name:'AeroPress',          origin:'Panamá Geisha',         cat:'filter',   emoji:'🧪', price:16000, notes:['Floral','Bergamota','Elegante'],       desc:'Geisha de lotes pequeños.', bg:'#3D2A1A' },
  { id:7, name:'Croissant almendra', origin:'Horno propio',          cat:'food',     emoji:'🥐', price:6500,  notes:['Crujiente','Mantequilla','Almendra'],  desc:'Horneado cada mañana con frangipane.', bg:'#3D3A1A' },
  { id:8, name:'Brownie Fudge',      origin:'Receta artesanal',      cat:'food',     emoji:'🍫', price:5500,  notes:['Chocolate 70%','Húmedo','Intenso'],    desc:'Brownie de chocolate negro. Textura fudgy.', bg:'#2A1A1A' },
];
const DEFAULT_CONFIG = {
  orders: true, pickup: true, prepTime: 8,
  payCard: true, payNequi: true, payPse: true, payCash: true,
  loyalty: true, goal: 400, ptsRate: 1
};

// ── Helpers síncronos (leen desde cache) ──
const getMenu    = () => DB.get('menu')    || [];
const getUsers   = () => DB.get('users')   || [];
const getOrders  = () => DB.get('orders')  || [];
const getSession = () => DB.get('session');
const getCfg     = () => DB.get('config')  || {};
const saveMenu   = m  => DB.set('menu', m);
const saveUsers  = u  => DB.set('users', u);
const saveOrders = o  => DB.set('orders', o);
const saveSession= s  => DB.set('session', s);

// ── Carga asíncrona inicial ──
async function loadDB() {
  await Promise.all([
    DB.load('users',   DEFAULT_USERS),
    DB.load('menu',    DEFAULT_MENU),
    DB.load('orders',  []),
    DB.load('session', null),
    DB.load('config',  DEFAULT_CONFIG),
  ]);
  // Cargar carritos de usuarios guardados
  const users = getUsers();
  for (const u of users) {
    await DB.load('cart_' + u.id, []);
  }
}

// ══════════════════════════════════════════════
//  ESTADO EN MEMORIA
// ══════════════════════════════════════════════
let curUser = null, cart = [], curItem = null, curQty = 1, upsellOn = false, editId = null, oFiltCur = 'all';
let selPayMethod = 'card', ptsEditUserId = null, trackInterval = null;
let usePoints = false, peField = null;
const GOAL = 400;
const CODES = ['A-47','B-12','C-38','A-91','D-22','E-09','F-31','G-18'];
const STAGES = [
  { key:'confirmed',  label:'Pedido confirmado',  icon:'✓',  desc:'Recibimos tu orden' },
  { key:'preparing',  label:'En preparación',     icon:'☕', desc:'Preparando tu café' },
  { key:'ready',      label:'¡Listo para recoger!', icon:'🎉', desc:'Tu pedido está en barra' },
  { key:'delivered',  label:'Entregado',           icon:'✓',  desc:'Disfrútalo' },
];
const AVATARS = ['☕','🫗','🍵','🥐','⭐','🎨','🌿','🔥','💎','🫧'];

function saveCart()  { if(curUser) DB.set('cart_'+curUser.id, cart); }
function loadCart()  { if(curUser) cart = DB.get('cart_'+curUser.id) || []; }

// ══════════════════════════════════════════════
//  INICIO
// ══════════════════════════════════════════════
async function init() {
  // Mostrar splash mientras se carga la BD
  go('splash');
  await loadDB();
  // Ocultar spinner, mostrar botón
  const loadEl = document.getElementById('splash-loading');
  const btnEl  = document.getElementById('splash-btn');
  if (loadEl) loadEl.style.display = 'none';
  if (btnEl)  btnEl.style.display  = 'block';

  const sid = getSession();
  if (sid) {
    const u = getUsers().find(u => u.id === sid);
    if (u) { curUser = u; afterLogin(); return; }
  }
  go('login');
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════
function atab(tab, btn) {
  document.querySelectorAll('.atab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('pnl-login').className = tab === 'login' ? 'pnl on' : 'pnl';
  document.getElementById('pnl-reg').className   = tab === 'reg'   ? 'pnl on' : 'pnl';
  ['li-err','rg-err'].forEach(id => { document.getElementById(id).style.display = 'none'; });
}

function doLogin() {
  const email = v('li-email'), pass = v('li-pass');
  const err = document.getElementById('li-err');
  err.style.display = 'none';
  if (!email || !pass) { showErr(err, 'Completa todos los campos.'); return; }
  const u = getUsers().find(u => u.email === email && u.pass === pass);
  if (!u) { showErr(err, 'Correo o contraseña incorrectos.'); return; }
  curUser = u; saveSession(u.id); afterLogin();
}

function doReg() {
  const name = v('rg-name'), email = v('rg-email'), pass = v('rg-pass');
  const err = document.getElementById('rg-err');
  err.style.display = 'none';
  if (!name || !email || !pass) { showErr(err, 'Completa todos los campos.'); return; }
  if (pass.length < 6) { showErr(err, 'Contraseña mínimo 6 caracteres.'); return; }
  const users = getUsers();
  if (users.find(u => u.email === email)) { showErr(err, 'Este correo ya está registrado.'); return; }
  const newU = { id: 'u' + Date.now(), email, pass, name, role: 'client', pts: 0, avatar: '☕' };
  users.push(newU); saveUsers(users);
  _cache['cart_' + newU.id] = [];  // inicializar carrito en cache
  curUser = newU; saveSession(newU.id);
  showToast('¡Bienvenido/a! ☕'); afterLogin();
}

function afterLogin() {
  loadCart();
  if (curUser.role === 'admin') {
    renderAdmin(); go('admin');
  } else {
    document.getElementById('h-name').textContent = curUser.name + ' ☕';
    document.getElementById('h-pts').textContent  = curUser.pts + ' pts';
    renderMenu(); go('home');
  }
}

function logout() {
  curUser = null; cart = []; saveSession(null); saveCart();
  updateBadges(); go('login');
}

// ══════════════════════════════════════════════
//  MENÚ
// ══════════════════════════════════════════════
function filterCat(el, cat) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on'); renderMenu(cat);
}

function renderMenu(cat = 'all') {
  const items = cat === 'all' ? getMenu() : getMenu().filter(p => p.cat === cat);
  const grid = document.getElementById('mgrid');
  if (!items.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Sin productos en esta categoría</div>'; return; }
  grid.innerHTML = items.map(p => `
    <div class="mcard" onclick="openDet(${p.id})">
      <div class="mcard-img" style="background:${p.bg}20">${p.emoji}</div>
      <div class="mcard-name">${p.name}</div>
      <div class="mcard-origin">${p.origin}</div>
      <div class="mcard-row">
        <div class="mcard-price">$${p.price.toLocaleString('es-CO')}</div>
        <button class="add-btn" onclick="event.stopPropagation();quickAdd(${p.id})">+</button>
      </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════
//  DETALLE
// ══════════════════════════════════════════════
function openDet(id) {
  curItem = getMenu().find(p => p.id == id); if (!curItem) return;
  curQty = 1; upsellOn = false;
  document.getElementById('det-em').textContent   = curItem.emoji;
  document.getElementById('det-name').textContent  = curItem.name;
  document.getElementById('det-orig').textContent  = 'Origen: ' + curItem.origin;
  document.getElementById('det-notes').innerHTML   = curItem.notes.map(n => `<span class="tc">${n}</span>`).join('');
  document.getElementById('det-desc').textContent  = curItem.desc || '';
  document.getElementById('det-hero').style.background = curItem.bg || 'var(--espresso)';
  document.getElementById('qty-n').textContent = '1';
  document.querySelectorAll('#opt-size .oc').forEach((c,i) => c.classList.toggle('on', i === 0));
  document.querySelectorAll('#opt-milk .oc').forEach((c,i) => c.classList.toggle('on', i === 0));
  const ub = document.getElementById('upsell');
  ub.style.background = 'rgba(200,135,74,.1)'; ub.style.border = '1px dashed var(--caramel)';
  updDet(); go('detail');
}

function selOpt(el, g) {
  document.querySelectorAll(`#opt-${g} .oc`).forEach(c => c.classList.remove('on'));
  el.classList.add('on'); updDet();
}
function chgQty(d) { curQty = Math.max(1, curQty + d); document.getElementById('qty-n').textContent = curQty; updDet(); }
function sizeX()   { const a = document.querySelector('#opt-size .oc.on'); return a?.textContent.includes('Mediano') ? 1500 : a?.textContent.includes('Grande') ? 2500 : 0; }
function updDet()  { if (!curItem) return; document.getElementById('det-price').textContent = '$' + ((curItem.price + sizeX()) * curQty + (upsellOn ? 4500 : 0)).toLocaleString('es-CO'); }
function addUpsell() {
  if (!upsellOn) {
    upsellOn = true;
    const ub = document.getElementById('upsell');
    ub.style.background = 'rgba(74,124,89,.1)'; ub.style.border = '1px dashed rgba(74,124,89,.5)';
    updDet();
  }
}
function addCart() {
  if (!curItem) return;
  const size = document.querySelector('#opt-size .oc.on')?.textContent || 'Pequeño';
  const milk = document.querySelector('#opt-milk .oc.on')?.textContent || 'Entera';
  cart.push({ ...curItem, size, milk, qty: curQty, unitPrice: curItem.price + sizeX() });
  if (upsellOn) cart.push({ id:99, name:'Croissant almendra', origin:'Maridaje', emoji:'🥐', qty:1, unitPrice:4500, size:'', milk:'' });
  saveCart(); updateBadges(); go('cart');
}
function quickAdd(id) {
  const p = getMenu().find(m => m.id == id); if (!p) return;
  cart.push({ ...p, size:'Mediano', milk:'Entera', qty:1, unitPrice:p.price });
  saveCart(); updateBadges(); showToast(p.emoji + ' ' + p.name + ' agregado');
}
function rmItem(i) {
  const item = cart[i];
  cart.splice(i, 1); saveCart(); renderCart(); updateBadges();
  showToast(item.emoji + ' ' + item.name + ' eliminado');
}
function updCartQty(i, d) {
  cart[i].qty = Math.max(1, cart[i].qty + d);
  saveCart(); renderCart(); updateBadges();
}
function clearCart() {
  if (!cart.length) return;
  cart = []; saveCart(); renderCart(); updateBadges();
  showToast('Carrito vaciado');
}
function cartTotal() { return cart.reduce((s, i) => s + i.unitPrice * i.qty, 0); }
function updateBadges() {
  const t = cart.reduce((s, i) => s + i.qty, 0);
  ['cb1','cb2','cb3','cb4','cb5'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = t; });
  updateTrackBadges();
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const vb = document.getElementById('vaciar-btn');
  if (!cart.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--mocha);opacity:.6;font-size:14px">Tu carrito está vacío ☕</div>';
    document.getElementById('cart-sum').innerHTML = '';
    document.getElementById('cart-total').textContent = '$0';
    if (vb) vb.style.display = 'none'; return;
  }
  if (vb) vb.style.display = 'inline-flex';
  list.innerHTML = cart.map((p, i) => `
    <div class="ci">
      <div class="ci-icon">${p.emoji}</div>
      <div class="ci-info">
        <div class="ci-name">${p.name}</div>
        <div class="ci-sub">${[p.size, p.milk].filter(x => x && x !== 'Sin leche').join(' · ')}</div>
      </div>
      <div class="ci-right">
        <div class="ci-price">$${(p.unitPrice * p.qty).toLocaleString('es-CO')}</div>
        <div class="ci-qty">
          <button class="ci-qty-btn" onclick="updCartQty(${i},-1)">−</button>
          <span class="ci-qty-n">${p.qty}</span>
          <button class="ci-qty-btn" onclick="updCartQty(${i},1)">+</button>
        </div>
        <button class="ci-rm" onclick="rmItem(${i})">🗑</button>
      </div>
    </div>`).join('');
  const sub = cartTotal();
  document.getElementById('cart-sum').innerHTML = `
    <div class="sr"><span>Subtotal</span><span>$${sub.toLocaleString('es-CO')}</span></div>
    <div class="sr"><span>Retiro en tienda</span><span style="color:var(--leaf)">Gratis</span></div>
    <div class="sr total"><span>Total</span><span>$${sub.toLocaleString('es-CO')}</span></div>`;
  document.getElementById('cart-total').textContent = '$' + sub.toLocaleString('es-CO');
}

// ══════════════════════════════════════════════
//  PAGO — flujo completo
// ══════════════════════════════════════════════
function goToPayment() {
  if (!cart.length) { showToast('Tu carrito está vacío', true); return; }
  renderPaymentScreen();
  go('payment');
}

function renderPaymentScreen() {
  const sub = cartTotal();
  document.getElementById('pay-total-amt').textContent = '$' + sub.toLocaleString('es-CO');
  document.getElementById('pay-items-list').innerHTML = cart.map(p =>
    `<div class="pay-sum-item"><span>${p.name}${p.size ? ' · ' + p.size : ''} ×${p.qty}</span><span>$${(p.unitPrice*p.qty).toLocaleString('es-CO')}</span></div>`
  ).join('');
  selMethod('card', document.querySelector('.pay-method'));
}

function selMethod(method, el) {
  selPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('sel'));
  el.classList.add('sel');
  ['form-card','form-nequi','form-pse','form-cash'].forEach(id => document.getElementById(id).classList.remove('show'));
  document.getElementById('form-' + method).classList.add('show');
  const labels = { card:'Pagar con tarjeta', nequi:'Pagar con Nequi', pse:'Continuar a PSE', cash:'Confirmar pedido (Efectivo)' };
  document.getElementById('btn-pay-lbl').textContent = labels[method] || 'Pagar ahora';
}

function fmtCard(el) {
  let v = el.value.replace(/\D/g,'').slice(0,16);
  el.value = v.replace(/(.{4})/g,'$1 ').trim();
}
function fmtExp(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2,4);
  el.value = v;
}
function fmtPhone(el) {
  let v = el.value.replace(/\D/g,'').slice(0,10);
  if (v.length > 6) v = v.slice(0,3) + ' ' + v.slice(3,6) + ' ' + v.slice(6);
  else if (v.length > 3) v = v.slice(0,3) + ' ' + v.slice(3);
  el.value = v;
}

function validatePayment() {
  if (selPayMethod === 'card') {
    const num = document.getElementById('cf-num').value.replace(/\s/g,'');
    if (num.length < 16) { showToast('Número de tarjeta incompleto', true); return false; }
    if (!document.getElementById('cf-exp').value.match(/^\d{2}\/\d{2}$/)) { showToast('Fecha de vencimiento inválida', true); return false; }
    if (document.getElementById('cf-cvv').value.length < 3) { showToast('CVV inválido', true); return false; }
    if (!document.getElementById('cf-name').value.trim()) { showToast('Ingresa el nombre de la tarjeta', true); return false; }
  }
  if (selPayMethod === 'nequi') {
    const ph = document.getElementById('nq-phone').value.replace(/\s/g,'');
    if (ph.length < 10) { showToast('Número de celular inválido', true); return false; }
  }
  if (selPayMethod === 'pse') {
    if (!document.getElementById('pse-bank').value) { showToast('Selecciona tu banco', true); return false; }
  }
  return true;
}

function processPayment() {
  if (!validatePayment()) return;
  document.getElementById('btn-pay-now').disabled = true;
  const methodLabels = { card:'Tarjeta', nequi:'Nequi', pse:'PSE', cash:'Efectivo' };
  document.getElementById('proc-method-lbl').textContent = 'Procesando con ' + methodLabels[selPayMethod] + '…';
  document.getElementById('pay-processing').classList.add('show');

  const steps = ['ps1','ps2','ps3','ps4'];
  let i = 0;
  // Efectivo: más rápido
  const delay = selPayMethod === 'cash' ? 400 : 700;
  const iv = setInterval(() => {
    if (i < steps.length) { document.getElementById(steps[i]).classList.add('done'); i++; }
    else {
      clearInterval(iv);
      setTimeout(() => {
        document.getElementById('pay-processing').classList.remove('show');
        document.getElementById('btn-pay-now').disabled = false;
        steps.forEach(s => document.getElementById(s).classList.remove('done'));
        finishOrder();
      }, 600);
    }
  }, delay);
}

function finishOrder() {
  const code    = CODES[Math.floor(Math.random() * CODES.length)];
  const total   = cartTotal();
  const disc    = pointsDiscount();
  const summary = cart.map(i => i.name + (i.size ? ' · ' + i.size : '')).join(', ');
  const cfg     = getCfg();
  const ptsRate = cfg.ptsRate || 1;
  const ptsEarned = Math.floor(total / 500) * ptsRate;
  const methodLabels = { card:'Tarjeta', nequi:'Nequi', pse:'PSE', cash:'Efectivo' };
  const methodIcons  = { card:'💳', nequi:'📱', pse:'🏦', cash:'💵' };

  // Deduct points if used
  let ptsDeducted = 0;
  if (usePoints && curUser) {
    const goal = cfg.goal || GOAL;
    const sets = Math.min(Math.floor(curUser.pts / goal), cart.length);
    ptsDeducted = sets * goal;
    curUser.pts = Math.max(0, curUser.pts - ptsDeducted);
  }

  // Guardar pedido
  const orders = getOrders();
  orders.unshift({
    id: 'o' + Date.now(), code,
    userId: curUser?.id || null,
    user_name: curUser?.name || 'Cliente',
    items: [...cart], items_summary: summary,
    total, subtotal: total, discount: disc,
    status: 'pending',
    pay_method: selPayMethod,
    pay_method_label: methodLabels[selPayMethod],
    pay_icon: methodIcons[selPayMethod],
    pay_status: 'approved',
    points_used: ptsDeducted,
    created_at: new Date().toISOString()
  });
  saveOrders(orders);

  // Actualizar puntos
  if (curUser && cfg.loyalty !== false) {
    curUser.pts = (curUser.pts || 0) + ptsEarned;
    const users = getUsers();
    const idx = users.findIndex(u => u.id === curUser.id);
    if (idx >= 0) { users[idx].pts = curUser.pts; saveUsers(users); }
    saveSession(curUser.id);
    document.getElementById('h-pts').textContent = curUser.pts + ' pts';
  }

  // Pantalla confirmación
  const goal = cfg.goal || GOAL;
  const pct = Math.min(100, Math.round((curUser?.pts || 0) / goal * 100));
  document.getElementById('conf-code').textContent = code;
  let ptsMsg = `Ganaste +${ptsEarned} pts 🎉`;
  if (ptsDeducted > 0) ptsMsg += ` · Canjeaste -${ptsDeducted} pts`;
  document.getElementById('pts-msg').textContent   = ptsMsg;
  document.getElementById('pts-bar').style.width   = pct + '%';
  document.getElementById('pts-prog').textContent  = `${curUser?.pts || 0} / ${goal} pts para café gratis`;
  
  // Badge método de pago
  const badge = document.getElementById('conf-pay-badge');
  const cashMsg = selPayMethod === 'cash' ? '💵 Paga en caja · Efectivo' : `✅ Pago aprobado · ${methodIcons[selPayMethod]} ${methodLabels[selPayMethod]}`;
  badge.textContent = cashMsg;
  
  // Sub mensaje
  if (selPayMethod === 'cash') {
    document.getElementById('conf-sub').innerHTML = 'Presenta el código en caja para pagar y retirar.<br>¡Tu pedido está en preparación!';
  } else {
    document.getElementById('conf-sub').innerHTML = 'Pago confirmado. Tu café está siendo preparado.<br>Recógelo en unos minutos.';
  }
  
  go('confirm');
}

function resetApp() {
  cart = []; usePoints = false; saveCart(); updateBadges(); go('home');
}

// ══════════════════════════════════════════════
//  LEALTAD
// ══════════════════════════════════════════════
function renderLoyalty() {
  const pts = curUser?.pts || 0;
  const cfg = getCfg();
  const goal = cfg.goal || GOAL;
  const pct = Math.min(100, Math.round(pts / goal * 100));
  document.getElementById('loy-pts').textContent    = pts;
  document.getElementById('loy-bar').style.width    = pct + '%';
  document.getElementById('loy-needed').textContent = `${Math.max(0, goal - pts)} pts para café gratis`;
  const myOrders = getOrders().filter(o => o.userId === curUser?.id).slice(0, 6);
  document.getElementById('loy-hist').innerHTML = myOrders.length
    ? myOrders.map(o => `
        <div style="background:var(--foam);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--espresso)">${o.items_summary}</div>
            <div style="font-size:11px;color:var(--mocha);opacity:.7;margin-top:2px">${fmtDate(o.created_at)} · ${o.pay_icon || ''}${o.pay_method_label || ''}</div>
          </div>
          <div style="color:var(--caramel);font-size:13px;font-weight:500">+${Math.floor(o.total/500)} pts</div>
        </div>`).join('')
    : '<div class="empty">Aún no tienes pedidos.</div>';
}

// ══════════════════════════════════════════════
//  PUNTOS — canje en checkout
// ══════════════════════════════════════════════
function togglePoints() {
  if (!curUser) return;
  const cfg = getCfg();
  const goal = cfg.goal || GOAL;
  if (curUser.pts < goal) { showToast(`Necesitas ${goal} pts para canjear (tienes ${curUser.pts})`, true); return; }
  usePoints = !usePoints;
  const el = document.getElementById('pts-toggle');
  const chk = document.getElementById('pts-toggle-check');
  el.classList.toggle('on', usePoints);
  chk.innerHTML = usePoints ? '✓' : '';
  renderPaymentScreen();
}

function pointsDiscount() {
  if (!usePoints || !curUser) return 0;
  const cfg = getCfg();
  const goal = cfg.goal || GOAL;
  // Cada "goal" pts = el item más barato del carrito gratis
  if (curUser.pts < goal) return 0;
  const sets = Math.floor(curUser.pts / goal);
  const cheapest = cart.reduce((min, i) => Math.min(min, i.unitPrice * i.qty), Infinity);
  return Math.min(cheapest * sets, cartTotal());
}

function renderPaymentScreen() {
  const sub = cartTotal();
  const disc = pointsDiscount();
  const total = sub - disc;
  document.getElementById('pay-total-amt').textContent = '$' + total.toLocaleString('es-CO');
  let html = cart.map(p =>
    `<div class="pay-sum-item"><span>${p.name}${p.size ? ' · ' + p.size : ''} ×${p.qty}</span><span>$${(p.unitPrice*p.qty).toLocaleString('es-CO')}</span></div>`
  ).join('');
  if (disc > 0) {
    html += `<div class="pay-discount-row"><span>⭐ Descuento por puntos (-${Math.floor(curUser.pts/(getCfg().goal||GOAL))} café${Math.floor(curUser.pts/(getCfg().goal||GOAL))>1?'s':''} gratis)</span><span>-$${disc.toLocaleString('es-CO')}</span></div>`;
  }
  document.getElementById('pay-items-list').innerHTML = html;
  selMethod('card', document.querySelector('.pay-method'));

  // Points toggle visibility
  const pt = document.getElementById('pts-toggle');
  const cfg = getCfg();
  const goal = cfg.goal || GOAL;
  if (curUser && cfg.loyalty !== false && curUser.pts >= goal) {
    pt.style.display = 'flex';
    const sets = Math.floor(curUser.pts / goal);
    document.getElementById('pts-toggle-sub').textContent = `Tienes ${curUser.pts} pts · ${sets} café${sets>1?'s':''} gratis`;
    pt.classList.toggle('on', usePoints);
    document.getElementById('pts-toggle-check').innerHTML = usePoints ? '✓' : '';
  } else {
    pt.style.display = 'none';
    usePoints = false;
  }
}

// ══════════════════════════════════════════════
//  PERFIL DE USUARIO
// ══════════════════════════════════════════════
function renderProfile() {
  if (!curUser) return;
  const cfg = getCfg();
  const goal = cfg.goal || GOAL;
  const pct = Math.min(100, Math.round(curUser.pts / goal * 100));
  const orders = getOrders().filter(o => o.userId === curUser.id);
  const spent = orders.reduce((s,o) => s + o.total, 0);

  document.getElementById('prf-avatar').textContent = curUser.avatar || '☕';
  document.getElementById('prf-name').textContent = curUser.name;
  document.getElementById('prf-email').textContent = curUser.email;
  document.getElementById('prf-pts').textContent = curUser.pts + ' pts';
  document.getElementById('prf-goal').textContent = goal + ' pts';
  document.getElementById('prf-pct').textContent = pct + '%';
  document.getElementById('prf-bar').style.width = pct + '%';
  document.getElementById('prf-disp-name').textContent = curUser.name;
  document.getElementById('prf-disp-email').textContent = curUser.email;
  document.getElementById('prf-total-orders').textContent = orders.length;
  document.getElementById('prf-total-spent').textContent = '$' + spent.toLocaleString('es-CO');
}

function openProfileEdit(field) {
  peField = field;
  const modal = document.getElementById('profile-edit-modal');
  const title = document.getElementById('pe-title');
  const body = document.getElementById('pe-body');

  if (field === 'name') {
    title.textContent = 'Cambiar nombre';
    body.innerHTML = `<div class="mg"><label class="ml">Nombre</label><input class="mi3" id="pe-input" value="${esc(curUser.name)}" maxlength="40"></div>`;
  } else if (field === 'email') {
    title.textContent = 'Cambiar correo';
    body.innerHTML = `<div class="mg"><label class="ml">Correo actual</label><div style="font-size:13px;color:var(--mocha);margin-bottom:10px">${curUser.email}</div></div>
      <div class="mg"><label class="ml">Nuevo correo</label><input class="mi3" id="pe-input" type="email" value="" placeholder="nuevo@correo.com" maxlength="60"></div>`;
  } else if (field === 'pass') {
    title.textContent = 'Cambiar contraseña';
    body.innerHTML = `
      <div class="mg"><label class="ml">Contraseña actual</label><input class="mi3" id="pe-pass-cur" type="password" placeholder="••••••••"></div>
      <div class="mg"><label class="ml">Nueva contraseña</label><input class="mi3" id="pe-pass-new" type="password" placeholder="Mínimo 6 caracteres"></div>`;
  } else if (field === 'avatar') {
    title.textContent = 'Elige tu avatar';
    body.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
      ${AVATARS.map(a => `<div class="av-choice" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:26px;background:${a===curUser.avatar?'rgba(200,135,74,.2)':'var(--cream)'};border-radius:12px;cursor:pointer;border:2px solid ${a===curUser.avatar?'var(--caramel)':'rgba(107,63,31,.1)'};transition:all .2s" onclick="pickAvatar('${a}',this)">${a}</div>`).join('')}
    </div>`;
    return;
  }
  modal.classList.add('on');
  setTimeout(() => { const inp = document.getElementById('pe-input'); if(inp) inp.focus(); }, 100);
}

function pickAvatar(av, el) {
  document.querySelectorAll('.av-choice').forEach(e => { e.style.background = 'var(--cream)'; e.style.borderColor = 'rgba(107,63,31,.1)'; });
  el.style.background = 'rgba(200,135,74,.2)'; el.style.borderColor = 'var(--caramel)';
  curUser.avatar = av;
  const users = getUsers();
  const idx = users.findIndex(u => u.id === curUser.id);
  if (idx >= 0) { users[idx].avatar = av; saveUsers(users); }
  saveSession(curUser.id);
}

function saveProfileEdit() {
  if (peField === 'avatar') {
    closeProfileEdit(); renderProfile();
    showToast('Avatar actualizado ✓');
    return;
  }
  if (peField === 'pass') {
    const cur = document.getElementById('pe-pass-cur').value;
    const newP = document.getElementById('pe-pass-new').value;
    if (cur !== curUser.pass) { showToast('Contraseña actual incorrecta', true); return; }
    if (newP.length < 6) { showToast('Mínimo 6 caracteres', true); return; }
    curUser.pass = newP;
    const users = getUsers();
    const idx = users.findIndex(u => u.id === curUser.id);
    if (idx >= 0) { users[idx].pass = newP; saveUsers(users); }
    saveSession(curUser.id);
    closeProfileEdit(); renderProfile();
    showToast('Contraseña cambiada ✓');
    return;
  }
  const val = document.getElementById('pe-input').value.trim();
  if (!val) { showToast('El campo no puede estar vacío', true); return; }
  if (peField === 'email') {
    if (!val.includes('@')) { showToast('Correo inválido', true); return; }
    const users = getUsers();
    if (users.find(u => u.email === val && u.id !== curUser.id)) { showToast('Este correo ya está en uso', true); return; }
    curUser.email = val;
    const idx = users.findIndex(u => u.id === curUser.id);
    if (idx >= 0) { users[idx].email = val; saveUsers(users); }
  } else if (peField === 'name') {
    curUser.name = val;
    const users = getUsers();
    const idx = users.findIndex(u => u.id === curUser.id);
    if (idx >= 0) { users[idx].name = val; saveUsers(users); }
  }
  saveSession(curUser.id);
  closeProfileEdit(); renderProfile();
  showToast('Perfil actualizado ✓');
}

function closeProfileEdit() {
  document.getElementById('profile-edit-modal').classList.remove('on');
  peField = null;
}

function esc(s) { return s.replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

// ══════════════════════════════════════════════
//  SEGUIMIENTO DE PEDIDOS
// ══════════════════════════════════════════════
let expandedOrders = {};

function getActiveOrders() {
  return getOrders().filter(o => o.userId === curUser?.id && ['pending','preparing','ready'].includes(o.status));
}
function countActive() { return getActiveOrders().length; }
function getElapsed(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  return `Hace ${Math.floor(min/60)}h ${min%60}min`;
}
function getETA(order) {
  const cfg = getCfg();
  const prepMin = (cfg.prepTime || 8) * 60000;
  const elapsed = Date.now() - new Date(order.created_at).getTime();
  const remaining = prepMin - elapsed;
  if (remaining <= 0) return null;
  const rmin = Math.ceil(remaining / 60000);
  return rmin < 1 ? '¡En un momento!' : `~${rmin} min`;
}
function isDelayed(order) {
  const cfg = getCfg();
  const prepMin = cfg.prepTime || 8;
  const diff = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  return order.status === 'preparing' && diff > prepMin * 1.5;
}
function getStageNum(o) { return o.status === 'pending' ? 0 : o.status === 'preparing' ? 1 : o.status === 'ready' ? 2 : 3; }

function renderTracking() {
  stopTracking();
  const active = getActiveOrders();
  const body = document.getElementById('track-body');
  updateTrackBadges();

  if (!active.length) {
    const past = getOrders().filter(o => o.userId === curUser?.id && (o.status === 'delivered' || o.status === 'cancelled')).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,8);
    body.innerHTML = `
      <div class="no-track">
        <div class="no-track-icon">📋</div>
        <div class="no-track-title">Sin pedidos activos</div>
        <div class="no-track-sub">No tienes pedidos en curso. ¡Haz uno nuevo!</div>
        <button class="no-track-btn" onclick="go('home')">Ver menú</button>
      </div>
      ${past.length ? `<div class="past-orders-title">Pedidos anteriores</div>` + past.map(o => `
        <div class="past-card">
          <div class="past-code">${o.code}</div>
          <div class="past-info">
            <div class="past-name">${o.items_summary}</div>
            <div class="past-meta">${fmtDate(o.created_at)} · ${o.status === 'cancelled' ? '❌ Cancelado' : '✅ Entregado'}</div>
          </div>
          <div class="past-total">$${o.total.toLocaleString('es-CO')}</div>
        </div>`).join('') : ''}`;
    document.getElementById('track-hdr-sub').textContent = 'Sin pedidos activos';
    return;
  }

  document.getElementById('track-hdr-sub').textContent = `${active.length} pedido${active.length>1?'s':''} en curso`;

  let html = active.map(o => {
    const cfg = getCfg();
    const prepMin = cfg.prepTime || 8;
    const delayed = isDelayed(o);
    const stage = getStageNum(o);
    const eta = getETA(o);
    const badgeCls = delayed ? 'ts-delayed' : o.status === 'pending' ? 'ts-pending' : o.status === 'preparing' ? 'ts-preparing' : 'ts-ready';
    const badgeTxt = delayed ? '⏰ Atrasado' : o.status === 'pending' ? 'Pendiente' : o.status === 'preparing' ? 'Preparando' : '¡Listo!';
    const pBar = o.status === 'pending' ? 'tpf-pending' : o.status === 'preparing' ? 'tpf-preparing' : 'tpf-ready';
    const isOpen = !!expandedOrders[o.id];

    return `<div class="track-card" id="tc-${o.id}">
      <div class="track-progress"><div class="track-progress-fill ${pBar}"></div></div>
      <div class="track-top">
        <div>
          <div class="track-code">${o.code}</div>
          <div class="track-meta">${getElapsed(o.created_at)}</div>
        </div>
        <span class="track-status-badge ${badgeCls}">${badgeTxt}</span>
      </div>
      <div class="track-items" onclick="toggleDetails('${o.id}')">
        ${o.items_summary}
        <span style="opacity:.4;font-size:11px">${isOpen ? '▾' : '▸'}</span>
      </div>
      <div class="track-details ${isOpen ? 'open' : ''}" id="td-${o.id}">
        ${(o.items || []).map((item, idx) => `
          <div class="track-detail-item">
            <div class="tdi-left">
              <span class="tdi-emoji">${item.emoji}</span>
              <div>
                <div class="tdi-name">${item.name}${item.size ? ' · ' + item.size : ''}</div>
                <div class="tdi-sub">${item.milk ? item.milk + ' · ' : ''}×${item.qty}</div>
              </div>
            </div>
            <div class="tdi-price">$${(item.unitPrice * item.qty).toLocaleString('es-CO')}</div>
          </div>`).join('')}
        <div class="track-detail-item" style="border:none;padding-top:10px;font-weight:500">
          <div class="tdi-name">Total</div>
          <div class="tdi-price">$${o.total.toLocaleString('es-CO')}</div>
        </div>
      </div>
      <div class="track-meta" style="margin-top:8px">
        ${delayed
          ? `<span class="eta-box delayed">⚠️ Atrasado</span>`
          : o.status === 'ready'
            ? `<span class="eta-box" style="background:rgba(63,185,80,.1);color:var(--success)">🎉 Listo para recoger</span>`
            : eta
              ? `<span class="eta-box">⏱ ${eta}</span>`
              : ''}
        <span>⏱ Est. ${prepMin} min</span>
      </div>
      <div class="timeline">
        ${STAGES.slice(0,3).map((s, i) => {
          const done = i < stage;
          const isActive = i === stage;
          const showDelay = isActive && delayed;
          return `<div class="tl-step">
            <div class="tl-line">
              <div class="tl-dot ${done ? 'done' : (showDelay ? 'delayed' : (isActive ? 'active' : ''))}">${showDelay ? '!' : s.icon}</div>
              ${i < 2 ? `<div class="tl-conn ${done ? 'done' : ''}"></div>` : ''}
            </div>
            <div class="tl-info">
              <div class="tl-title" style="${showDelay ? 'color:var(--danger)' : ''}">${s.label}</div>
              <div class="tl-time">${done ? 'Completado' : (isActive ? (delayed ? 'Atrasado · revisando...' : s.desc) : '—')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${o.status === 'pending' ? `<button class="track-cancel" onclick="cancelOrder('${o.id}')">Cancelar pedido</button>` : ''}
    </div>`;
  }).join('');

  body.innerHTML = html;

  // Update ETAs every 15s
  trackInterval = setInterval(() => {
    const updated = getActiveOrders();
    const changed = JSON.stringify(updated.map(o => o.status)) !== JSON.stringify(active.map(o => o.status));
    if (changed) {
      renderTracking();
    } else {
      // Soft update: refresh elapsed + ETA text only
      updated.forEach(o => {
        const card = document.getElementById('tc-' + o.id);
        if (!card) return;
        const meta = card.querySelector('.track-meta');
        if (meta) {
          const delayed = isDelayed(o);
          const eta = getETA(o);
          const wasDelayed = card.querySelector('.eta-box.delayed');
          if (delayed && !wasDelayed) renderTracking();
          else {
            const timeSpans = card.querySelectorAll('.track-meta .eta-box, .track-meta span');
          }
        }
      });
    }
  }, 15000);
}

function toggleDetails(id) {
  expandedOrders[id] = !expandedOrders[id];
  const el = document.getElementById('td-' + id);
  if (el) el.classList.toggle('open');
  const items = document.querySelector(`#tc-${id} .track-items span`);
  if (items) items.textContent = expandedOrders[id] ? '▾' : '▸';
}

function cancelOrder(id) {
  if (!confirm('¿Cancelar este pedido?')) return;
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx >= 0) {
    orders[idx].status = 'cancelled';
    saveOrders(orders);
    showToast('Pedido cancelado');
    renderTracking();
  }
}

function updateTrackBadges() {
  const n = countActive();
  ['tp1','tp2','tp3','tp4','tp5'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = n;
      el.className = 'track-pulse' + (n > 0 ? ' pulse-on' : '');
    }
  });
}

function stopTracking() {
  if (trackInterval) { clearInterval(trackInterval); trackInterval = null; }
}

// ══════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════
function renderAdmin() {
  renderOverview(); renderAOrders(); renderAMenu(); renderAUsers();
  renderPaymentsTab(); renderReports(); loadCfg();
}

function renderOverview() {
  const today   = new Date().toDateString();
  const orders  = getOrders();
  const todayO  = orders.filter(o => new Date(o.created_at).toDateString() === today);
  const clients = getUsers().filter(u => u.role === 'client');
  document.getElementById('st-orders').textContent = todayO.length;
  document.getElementById('st-sales').textContent  = '$' + (todayO.reduce((s,o) => s+o.total, 0)/1000).toFixed(0) + 'k';
  document.getElementById('st-users').textContent  = clients.length;
  document.getElementById('st-prods').textContent  = getMenu().length;

  // Actividad de pagos de hoy
  const payEl = document.getElementById('a-pay-today');
  if (todayO.length) {
    const methodCounts = {};
    todayO.forEach(o => { methodCounts[o.pay_method_label || 'Sin método'] = (methodCounts[o.pay_method_label || 'Sin método'] || 0) + 1; });
    payEl.innerHTML = Object.entries(methodCounts).map(([m, c]) => `
      <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(200,135,74,.1);border:1px solid rgba(200,135,74,.2);border-radius:8px;padding:5px 10px;font-size:12px;color:var(--latte);margin:0 5px 5px 0">
        ${c} pedido${c>1?'s':''} · ${m}
      </span>`).join('');
  } else {
    payEl.innerHTML = '<div style="font-size:12px;color:rgba(212,160,106,.4)">Sin pedidos hoy aún.</div>';
  }

  document.getElementById('a-recent').innerHTML = orders.slice(0, 4).map(o => orderRow(o, false)).join('')
    || '<div class="empty">Sin pedidos aún.</div>';
}

function renderAOrders() {
  const all = getOrders();
  const filtered = oFiltCur === 'all' ? all : all.filter(o => o.status === oFiltCur);
  document.getElementById('a-orders').innerHTML = filtered.length
    ? filtered.map(o => orderRow(o, true)).join('')
    : '<div class="empty">Sin pedidos.</div>';
}

function orderRow(o, editable) {
  const payBadge = o.pay_method ? `<span class="or-pay-badge pay-${o.pay_method}-b">${o.pay_icon || ''} ${o.pay_method_label || o.pay_method}</span>` : '';
  return `<div class="or">
    <div class="or-code">${o.code}</div>
    <div class="or-info">
      <div class="or-name">${o.user_name}</div>
      <div class="or-items">${o.items_summary}</div>
      ${payBadge}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      <div class="or-price">$${o.total.toLocaleString('es-CO')}</div>
      ${editable
        ? `<select class="st-sel ${stCls(o.status)}" onchange="updStatus('${o.id}',this)">
            <option value="pending"   ${o.status==='pending'  ?'selected':''}>Pendiente</option>
            <option value="preparing" ${o.status==='preparing'?'selected':''}>Preparando</option>
            <option value="ready"     ${o.status==='ready'    ?'selected':''}>Listo</option>
            <option value="delivered" ${o.status==='delivered'?'selected':''}>Entregado</option>
           </select>`
        : `<span style="font-size:10px;padding:3px 8px;border-radius:6px" class="${stCls(o.status)}">${stLbl(o.status)}</span>`}
    </div>
  </div>`;
}

function updStatus(id, sel) {
  const s = sel.value;
  sel.className = `st-sel ${stCls(s)}`;
  const orders = getOrders();
  const o = orders.find(o => o.id === id);
  if (o) { o.status = s; saveOrders(orders); }
  showToast('Estado actualizado ✓');
}

function renderAMenu() {
  const cats = { espresso:'Espresso', cold:'Cold Brew', filter:'Filtrado', food:'Repostería' };
  document.getElementById('a-menu').innerHTML = getMenu().map(p => `
    <div class="mi">
      <div class="mi-em">${p.emoji}</div>
      <div class="mi-info"><div class="mi-name">${p.name}</div><div class="mi-cat">${cats[p.cat]||p.cat}</div></div>
      <div class="mi-price">$${p.price.toLocaleString('es-CO')}</div>
      <div style="display:flex;gap:6px">
        <button class="ab ab-e" onclick="openEdit(${p.id})">✏️</button>
        <button class="ab ab-d" onclick="delProd(${p.id})">🗑</button>
      </div>
    </div>`).join('');
}

function renderAUsers() {
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  const users = getUsers().filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  document.getElementById('a-users').innerHTML = users.map(u => `
    <div class="ur">
      <div class="u-av">${u.avatar || '👤'}</div>
      <div class="u-info"><div class="u-name">${u.name}</div><div class="u-email">${u.email}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span class="u-role ${u.role==='admin'?'r-admin':'r-client'}">${u.role==='admin'?'Admin':'Cliente'}</span>
        ${u.pts > 0 ? `<span class="u-pts">⭐ ${u.pts} pts</span>` : ''}
        ${u.role !== 'admin' ? `<div class="u-actions"><button class="ab ab-pts" onclick="openPtsModal('${u.id}')">+ Pts</button></div>` : ''}
      </div>
    </div>`).join('') || '<div class="empty">Sin resultados.</div>';
}

// ── Ajuste de puntos ──
function openPtsModal(uid) {
  const u = getUsers().find(u => u.id === uid); if (!u) return;
  ptsEditUserId = uid;
  document.getElementById('pts-modal-user').textContent = u.name + ' · ' + u.email;
  document.getElementById('pts-current').value = u.pts || 0;
  document.getElementById('pts-delta').value = '';
  document.getElementById('pts-reason').value = '';
  document.getElementById('pts-modal').classList.add('on');
}
function closePtsModal() { document.getElementById('pts-modal').classList.remove('on'); ptsEditUserId = null; }
function applyPts() {
  const delta = parseInt(document.getElementById('pts-delta').value) || 0;
  if (!delta) { showToast('Ingresa un ajuste distinto de 0', true); return; }
  const users = getUsers();
  const idx = users.findIndex(u => u.id === ptsEditUserId);
  if (idx < 0) return;
  users[idx].pts = Math.max(0, (users[idx].pts || 0) + delta);
  saveUsers(users);
  if (curUser && curUser.id === ptsEditUserId) { curUser.pts = users[idx].pts; }
  closePtsModal(); renderAUsers();
  showToast(`Puntos ajustados (${delta > 0 ? '+' : ''}${delta}) ✓`);
}

// ══════════════════════════════════════════════
//  TAB PAGOS
// ══════════════════════════════════════════════
function renderPaymentsTab() {
  const orders = getOrders().filter(o => o.pay_method);
  const total = orders.reduce((s,o) => s + o.total, 0);
  const avg = orders.length ? Math.round(total / orders.length) : 0;
  document.getElementById('ps-total').textContent = '$' + (total/1000).toFixed(0) + 'k';
  document.getElementById('ps-count').textContent = orders.length;
  document.getElementById('ps-avg').textContent   = '$' + (avg/1000).toFixed(0) + 'k';

  // Distribución por método
  const methods = { card:{label:'Tarjeta',color:'#58A6FF'}, nequi:{label:'Nequi',color:'#9933FF'}, pse:{label:'PSE',color:'#3FB950'}, cash:{label:'Efectivo',color:'#C8874A'} };
  const counts = {};
  orders.forEach(o => { counts[o.pay_method] = (counts[o.pay_method] || 0) + 1; });
  const total2 = orders.length || 1;

  // Donut canvas
  const canvas = document.getElementById('donut-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 120, 120);
  let angle = -Math.PI / 2;
  const cx = 60, cy = 60, r = 48, ir = 30;
  if (orders.length === 0) {
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2); ctx.fillStyle='#16213E'; ctx.fill();
  } else {
    Object.entries(methods).forEach(([key, {color}]) => {
      const c = counts[key] || 0; if (!c) return;
      const sweep = (c / total2) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+sweep); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      angle += sweep;
    });
    ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2); ctx.fillStyle='#16213E'; ctx.fill();
    ctx.fillStyle='rgba(212,160,106,.8)'; ctx.font='bold 14px DM Sans'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(orders.length, cx, cy);
  }

  document.getElementById('pay-legend').innerHTML = Object.entries(methods).map(([key,{label,color}]) =>
    `<div class="pay-leg-item"><div class="pay-leg-dot" style="background:${color}"></div>${label} (${counts[key]||0})</div>`
  ).join('');

  // Transacciones
  document.getElementById('pay-tx-list').innerHTML = orders.slice(0,10).map(o => `
    <div class="pay-tx">
      <div class="pay-tx-icon">${o.pay_icon||'💳'}</div>
      <div class="pay-tx-info">
        <div class="pay-tx-name">${o.user_name}</div>
        <div class="pay-tx-meta">${o.code} · ${fmtDate(o.created_at)}</div>
      </div>
      <div style="text-align:right">
        <div class="pay-tx-amt">$${o.total.toLocaleString('es-CO')}</div>
        <span class="pay-tx-status pay-ok">Aprobado</span>
      </div>
    </div>`).join('') || '<div class="empty">Sin transacciones aún.</div>';
}

// ══════════════════════════════════════════════
//  TAB REPORTES
// ══════════════════════════════════════════════
function renderReports() {
  const orders = getOrders();
  // Ventas últimos 7 días
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const total = orders.filter(o => new Date(o.created_at).toDateString() === key).reduce((s,o) => s+o.total, 0);
    days.push({ lbl: d.toLocaleDateString('es-CO', {weekday:'short'}), total });
  }
  const maxVal = Math.max(...days.map(d => d.total), 1);
  document.getElementById('rep-bars').innerHTML = days.map(d => `
    <div class="rep-bar-col">
      <div class="rep-bar" style="height:${Math.max(4, Math.round(d.total/maxVal*70))}px" title="$${d.total.toLocaleString('es-CO')}"></div>
      <div class="rep-bar-lbl">${d.lbl}</div>
    </div>`).join('');

  // Top productos
  const prods = {};
  orders.forEach(o => o.items?.forEach(i => {
    if (!prods[i.name]) prods[i.name] = { count:0, rev:0, emoji:i.emoji };
    prods[i.name].count += i.qty;
    prods[i.name].rev += i.unitPrice * i.qty;
  }));
  const sorted = Object.entries(prods).sort((a,b) => b[1].count - a[1].count).slice(0,5);
  document.getElementById('rep-top-products').innerHTML = sorted.length
    ? sorted.map(([name, d], i) => `
        <div class="rep-top-item">
          <div class="rep-rank">${i+1}</div>
          <div style="font-size:18px">${d.emoji}</div>
          <div class="rep-item-name">${name}</div>
          <div class="rep-item-count">${d.count} uds.</div>
          <div class="rep-item-rev">$${(d.rev/1000).toFixed(0)}k</div>
        </div>`).join('')
    : '<div class="empty">Sin datos aún.</div>';
}

function exportCSV() {
  const orders = getOrders();
  if (!orders.length) { showToast('Sin pedidos para exportar', true); return; }
  const rows = [['Código','Cliente','Resumen','Total','Método','Estado','Fecha']];
  orders.forEach(o => rows.push([o.code, o.user_name, o.items_summary, o.total, o.pay_method_label||'', o.status, o.created_at]));
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='aroma_grano_reporte.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('Reporte exportado ✓');
}

function printReport() {
  const orders = getOrders();
  const total = orders.reduce((s,o) => s+o.total, 0);
  const today = new Date().toLocaleDateString('es-CO',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const win = window.open('','_blank');
  win.document.write(`<html><head><title>Reporte Aroma & Grano</title>
  <style>body{font-family:sans-serif;padding:30px;color:#2C1A0E}h1{color:#C8874A}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#F5F0E8}</style></head>
  <body><h1>☕ Aroma & Grano — Reporte</h1><p>${today}</p>
  <p><strong>Total pedidos:</strong> ${orders.length} &nbsp;|&nbsp; <strong>Ingresos totales:</strong> $${total.toLocaleString('es-CO')}</p>
  <table><tr><th>Código</th><th>Cliente</th><th>Resumen</th><th>Total</th><th>Método</th><th>Estado</th></tr>
  ${orders.map(o=>`<tr><td>${o.code}</td><td>${o.user_name}</td><td>${o.items_summary}</td><td>$${o.total.toLocaleString('es-CO')}</td><td>${o.pay_method_label||''}</td><td>${stLbl(o.status)}</td></tr>`).join('')}
  </table></body></html>`);
  win.print();
}

// ══════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════
function loadCfg() {
  const cfg = getCfg();
  const map = { orders:'cfg-orders', pickup:'cfg-pickup', payCard:'cfg-pay-card', payNequi:'cfg-pay-nequi', payPse:'cfg-pay-pse', payCash:'cfg-pay-cash', loyalty:'cfg-loyalty' };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id); if (!el) return;
    if (cfg[key] !== false) el.classList.add('on'); else el.classList.remove('on');
  });
  if (document.getElementById('cfg-time')) document.getElementById('cfg-time').value = cfg.prepTime || 8;
  if (document.getElementById('cfg-goal')) document.getElementById('cfg-goal').value = cfg.goal || 400;
  if (document.getElementById('cfg-pts-rate')) document.getElementById('cfg-pts-rate').value = cfg.ptsRate || 1;
}

function toggleCfg(key, el) {
  el.classList.toggle('on');
}

function saveCfg() {
  const map = { orders:'cfg-orders', pickup:'cfg-pickup', payCard:'cfg-pay-card', payNequi:'cfg-pay-nequi', payPse:'cfg-pay-pse', payCash:'cfg-pay-cash', loyalty:'cfg-loyalty' };
  const cfg = getCfg();
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id); if (el) cfg[key] = el.classList.contains('on');
  });
  cfg.prepTime = parseInt(document.getElementById('cfg-time')?.value) || 8;
  cfg.goal = parseInt(document.getElementById('cfg-goal')?.value) || 400;
  cfg.ptsRate = parseInt(document.getElementById('cfg-pts-rate')?.value) || 1;
  DB.set('config', cfg);
  showToast('Configuración guardada ✓');
}

// ══════════════════════════════════════════════
//  CRUD PRODUCTOS
// ══════════════════════════════════════════════
function openAdd() {
  editId = null;
  document.getElementById('modal-t').textContent = 'Agregar producto';
  ['m-name','m-origin','m-price','m-notes','m-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('m-cat').value   = 'espresso';
  document.getElementById('m-emoji').value = '☕';
  document.getElementById('prod-modal').classList.add('on');
}

function openEdit(id) {
  const p = getMenu().find(m => m.id == id); if (!p) return;
  editId = id;
  document.getElementById('modal-t').textContent = 'Editar producto';
  document.getElementById('m-name').value   = p.name;
  document.getElementById('m-origin').value = p.origin;
  document.getElementById('m-price').value  = p.price;
  document.getElementById('m-cat').value    = p.cat;
  document.getElementById('m-emoji').value  = p.emoji;
  document.getElementById('m-notes').value  = (p.notes || []).join(', ');
  document.getElementById('m-desc').value   = p.desc || '';
  document.getElementById('prod-modal').classList.add('on');
}

function closeModal() { document.getElementById('prod-modal').classList.remove('on'); }

function saveProd() {
  const name   = v('m-name'), origin = v('m-origin'),
        price  = parseInt(v('m-price')) || 0,
        cat    = document.getElementById('m-cat').value,
        emoji  = v('m-emoji') || '☕',
        notes  = v('m-notes').split(',').map(s => s.trim()).filter(Boolean),
        desc   = v('m-desc');
  if (!name || !price) { showToast('Nombre y precio son obligatorios', true); return; }
  const menu = getMenu();
  if (editId) {
    const idx = menu.findIndex(p => p.id == editId);
    if (idx >= 0) menu[idx] = { ...menu[idx], name, origin, cat, emoji, price, notes, desc };
  } else {
    const newId = menu.length ? Math.max(...menu.map(p => p.id)) + 1 : 1;
    menu.push({ id: newId, name, origin, cat, emoji, price, notes, desc, bg: '#2C1A0E' });
  }
  saveMenu(menu); closeModal(); renderAMenu();
  showToast(editId ? 'Producto actualizado ✓' : 'Producto agregado ✓');
}

function delProd(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  saveMenu(getMenu().filter(p => p.id != id));
  renderAMenu(); showToast('Producto eliminado');
}

// ══════════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════════
function go(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + screen).classList.add('active');
  if (screen === 'cart')      renderCart();
  if (screen === 'loyalty')   renderLoyalty();
  if (screen === 'home')      renderMenu();
  if (screen === 'tracking')  renderTracking();
  if (screen === 'profile')   renderProfile();
  updateBadges();
}

function aTab(tab, btn) {
  document.querySelectorAll('.at').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.tp').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('tp-' + tab).classList.add('on');
  if (tab === 'overview')  renderOverview();
  if (tab === 'orders')    renderAOrders();
  if (tab === 'menu')      renderAMenu();
  if (tab === 'users')     renderAUsers();
  if (tab === 'payments')  renderPaymentsTab();
  if (tab === 'reports')   renderReports();
  if (tab === 'config')    loadCfg();
}

function oFilt(f, btn) {
  document.querySelectorAll('.ofb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  oFiltCur = f; renderAOrders();
}

// ══════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════
function v(id) { return document.getElementById(id).value.trim(); }
function stCls(s) { return s==='ready'||s==='delivered'?'st-ok':s==='preparing'?'st-r':'st-p'; }
function stLbl(s) { return s==='delivered'?'Entregado':s==='ready'?'Listo':s==='preparing'?'Preparando':'Pendiente'; }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('es-CO', { weekday:'short', day:'numeric', month:'short' }); }

function showToast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = err ? 'err' : '';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2800);
}
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

// ── Arrancar ──
init();
