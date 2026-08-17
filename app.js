/* ==========================================================================
   Vajra Healthy Living — shared site logic
   Loaded on every page. Functions that only apply to a specific page check
   for their DOM elements first and no-op if that page doesn't have them.
   ========================================================================== */

/* ============ MEMBERSHIP (Supabase) ============ */
// Fill these in once you've created your Supabase project:
// Project Settings -> API -> Project URL / anon public key.
// The anon key is safe to expose in client code by design (it only allows
// what your Row Level Security policies permit — see supabase-schema.sql).
const SUPABASE_URL = 'https://gmrauohsrbogfazqalvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtcmF1b2hzcmJvZ2ZhenFhbHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5OTUwMjksImV4cCI6MjEwMjU3MTAyOX0.7of29bujocaWwNyWFhO3UQbHNNLhCV2n6ID2WBZJU-g';

let supabaseClient = null;
if(!SUPABASE_URL.includes('REPLACE_WITH') && window.supabase){
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let currentSession = null; // Supabase session (has .access_token, .user)
let currentProfile = null; // row from the `profiles` table

async function initAuth(){
  if(!supabaseClient) return; // not configured yet — site still works, just no accounts

  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;
  if(currentSession) await afterSignIn();
  updateAcctUI();

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    currentSession = session;
    if(event === 'SIGNED_IN') await afterSignIn();
    if(event === 'SIGNED_OUT'){ currentProfile = null; }
    updateAcctUI();
    renderCartDiscountNote();
  });
}

async function afterSignIn(){
  if(!currentSession) return;
  const userId = currentSession.user.id;
  const { data: existing } = await supabaseClient.from('profiles').select('*').eq('id', userId).maybeSingle();

  if(existing){
    currentProfile = existing;
    return;
  }

  // First time this user has completed sign-in — create their profile row
  // from whatever they filled in on the Join form (saved to localStorage
  // just before the magic link was sent, since the email-link redirect
  // loses in-memory JS state — and may even land them back on a different
  // page than the one they signed up from).
  const pending = JSON.parse(localStorage.getItem('vajra_pending_profile') || 'null');
  const newProfile = {
    id: userId,
    name: pending?.name || currentSession.user.email,
    email: currentSession.user.email,
    dob: pending?.dob || null,
    phone: pending?.phone || null,
    interests: pending?.interests || [],
    marketing_consent: pending?.marketing_consent ?? true,
  };
  const { data: inserted } = await supabaseClient.from('profiles').insert(newProfile).select().single();
  currentProfile = inserted || newProfile;
  localStorage.removeItem('vajra_pending_profile');
}

function updateAcctUI(){
  const label = document.getElementById('acctLabel');
  const signedOut = document.getElementById('acctSignedOutView');
  const signedIn = document.getElementById('acctSignedInView');
  if(!label) return;

  if(currentSession){
    label.textContent = (currentProfile?.name || 'Account').split(' ')[0];
    signedOut.style.display = 'none';
    signedIn.style.display = 'block';
    document.getElementById('acctMemberName').textContent = ', ' + (currentProfile?.name || '');
    document.getElementById('acctMemberStatus').textContent = currentProfile && currentProfile.has_ordered === false
      ? 'You have a 10% discount waiting on your first order.'
      : 'Thanks for being a Vajra member.';
  }else{
    label.textContent = 'Join / Sign in';
    signedOut.style.display = 'block';
    signedIn.style.display = 'none';
  }
}

function renderCartDiscountNote(){
  const el = document.getElementById('cartDiscountNote');
  if(!el) return;
  if(currentSession && currentProfile && currentProfile.has_ordered === false){
    el.style.display = 'block';
    el.textContent = "You're signed in as a member — 10% off will be applied automatically at checkout on your first order.";
  }else{
    el.style.display = 'none';
  }
}

function wireAccountModal(){
  const acctBtn = document.getElementById('acctBtn');
  if(!acctBtn) return;

  function showAcctMessage(text){
    const panel = document.getElementById('acctMsgPanel');
    document.getElementById('acctMsgText').textContent = text;
    panel.classList.add('show');
  }

  acctBtn.addEventListener('click', ()=> document.getElementById('acctOverlay').classList.add('open'));
  document.getElementById('acctClose').addEventListener('click', ()=> document.getElementById('acctOverlay').classList.remove('open'));
  document.getElementById('acctOverlay').addEventListener('click', e=>{
    if(e.target.id==='acctOverlay') document.getElementById('acctOverlay').classList.remove('open');
  });
  document.getElementById('tabJoin').addEventListener('click', ()=>{
    document.getElementById('tabJoin').classList.add('active');
    document.getElementById('tabSignin').classList.remove('active');
    document.getElementById('joinForm').style.display = 'block';
    document.getElementById('signinForm').style.display = 'none';
  });
  document.getElementById('tabSignin').addEventListener('click', ()=>{
    document.getElementById('tabSignin').classList.add('active');
    document.getElementById('tabJoin').classList.remove('active');
    document.getElementById('signinForm').style.display = 'block';
    document.getElementById('joinForm').style.display = 'none';
  });

  document.getElementById('joinForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!supabaseClient){ showAcctMessage('Membership isn\'t configured yet — see supabase-schema.sql for setup.'); return; }
    const email = document.getElementById('jEmail').value.trim();
    const pending = {
      name: document.getElementById('jName').value.trim(),
      dob: document.getElementById('jDob').value || null,
      phone: document.getElementById('jPhone').value.trim() || null,
      interests: [...document.querySelectorAll('.jInterest:checked')].map(c=>c.value),
      marketing_consent: document.getElementById('jConsent').checked,
    };
    localStorage.setItem('vajra_pending_profile', JSON.stringify(pending));
    const { error } = await supabaseClient.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    showAcctMessage(error ? ('Something went wrong: '+error.message) : `Check your inbox — we sent a sign-in link to ${email}.`);
  });

  document.getElementById('signinForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!supabaseClient){ showAcctMessage('Membership isn\'t configured yet — see supabase-schema.sql for setup.'); return; }
    const email = document.getElementById('sEmail').value.trim();
    const { error } = await supabaseClient.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    showAcctMessage(error ? ('Something went wrong: '+error.message) : `Check your inbox — we sent a sign-in link to ${email}.`);
  });

  document.getElementById('signOutBtn').addEventListener('click', async ()=>{
    if(supabaseClient) await supabaseClient.auth.signOut();
    currentSession = null; currentProfile = null;
    updateAcctUI();
    renderCartDiscountNote();
    document.getElementById('acctOverlay').classList.remove('open');
  });
}

/* ============ DATA (catalog + practitioners, loaded from Excel) ============ */
const doshaColor = { vata:'#4F6E99', pitta:'#963B20', kapha:'#425A3B', tridoshic:'#B8923F' };
const doshaLabel = { vata:'Vata', pitta:'Pitta', kapha:'Kapha', tridoshic:'Tridoshic' };

let products = [];
let productsLoadFailed = false;

async function loadProducts(){
  try{
    const res = await fetch('products.xlsx');
    if(!res.ok) throw new Error('Fetch failed: '+res.status);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
    products = rows.map((row, i) => ({
      id: String(row['Product ID'] || ('p'+(i+1))),
      company: String(row['Company'] || ''),
      name: String(row['Product Name'] || 'Untitled product'),
      cat: String(row['Category'] || ''),
      dosha: String(row['Dosha Tag'] || 'tridoshic').toLowerCase().trim(),
      pack: String(row['Pack Size (assumed)'] || ''),
      price: Number(row['Recommended US Price (USD)']) || 0,
      desc: String(row['Primary Use / Positioning'] || ''),
    })).filter(p => p.name && p.name !== 'Untitled product');
  }catch(err){
    console.error('Could not load products.xlsx', err);
    productsLoadFailed = true;
    products = [];
  }
}

let practitioners = [];
let practitionersLoadFailed = false;

async function loadPractitioners(){
  try{
    const res = await fetch('practitioners.xlsx');
    if(!res.ok) throw new Error('Fetch failed: '+res.status);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {defval:''});
    practitioners = rows.map(row => ({
      name: String(row['Practitioner Name'] || 'Practitioner'),
      cred: String(row['Credentials'] || ''),
      focus: String(row['Focus / Specialty'] || ''),
      years: String(row['Years Experience'] || ''),
      initials: String(row['Initials'] || '').toUpperCase(),
      color: String(row['Avatar Color'] || 'var(--gold)'),
    })).filter(p => p.name && p.name !== 'Practitioner');
  }catch(err){
    console.error('Could not load practitioners.xlsx', err);
    practitionersLoadFailed = true;
    practitioners = [];
  }
}

/* ============ PRODUCT ICONS ============ */
function hexToRgba(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function getProductIcon(category){
  const cat = (category||'').toLowerCase();
  if(cat.includes('facial')){
    return `<svg viewBox="0 0 60 60" fill="none"><path d="M24 10h12v8l4 4v26a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2V22l4-4z" stroke="#B8923F" stroke-width="2"/><rect x="26" y="6" width="8" height="6" rx="1" stroke="#B8923F" stroke-width="2"/><path d="M20 34h20" stroke="#B8923F" stroke-width="1.4" stroke-dasharray="2 3"/></svg>`;
  }
  if(cat.includes('oil')){
    return `<svg viewBox="0 0 60 60" fill="none"><path d="M22 8h16v7l3 5v30a2 2 0 0 1-2 2H21a2 2 0 0 1-2-2V20l3-5z" stroke="#B8923F" stroke-width="2"/><rect x="25" y="4" width="10" height="6" rx="1" stroke="#B8923F" stroke-width="2"/><path d="M19 34h22" stroke="#B8923F" stroke-width="1.4" stroke-dasharray="2 3"/></svg>`;
  }
  if(cat.includes('arishta') || cat.includes('tonic') || cat.includes('liquid')){
    return `<svg viewBox="0 0 60 60" fill="none"><path d="M27 8h6v6l6 4v10c4 4 6 10 6 15a9 9 0 0 1-18 0c0-5 2-11 6-15V18l-6-4z" stroke="#B8923F" stroke-width="2"/><path d="M22 40h16" stroke="#B8923F" stroke-width="1.4" stroke-dasharray="2 3"/></svg>`;
  }
  if(cat.includes('chyawanprash') || cat.includes('rasayana') || cat.includes('ghee') || cat.includes('food')){
    return `<svg viewBox="0 0 60 60" fill="none"><rect x="16" y="22" width="28" height="26" rx="4" stroke="#B8923F" stroke-width="2"/><rect x="19" y="14" width="22" height="8" rx="2" stroke="#B8923F" stroke-width="2"/><path d="M22 32h16M22 38h16" stroke="#B8923F" stroke-width="1.4" stroke-dasharray="2 3"/></svg>`;
  }
  if(cat.includes('gummy')){
    return `<svg viewBox="0 0 60 60" fill="none"><rect x="15" y="18" width="30" height="30" rx="6" stroke="#B8923F" stroke-width="2"/><rect x="19" y="11" width="22" height="8" rx="2" stroke="#B8923F" stroke-width="2"/><circle cx="26" cy="34" r="5" stroke="#B8923F" stroke-width="1.6"/><circle cx="36" cy="39" r="5" stroke="#B8923F" stroke-width="1.6"/></svg>`;
  }
  if(cat.includes('powder') || cat.includes('decoction') || cat.includes('churna')){
    return `<svg viewBox="0 0 60 60" fill="none"><path d="M18 16h24l3 8v20a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V24z" stroke="#B8923F" stroke-width="2"/><path d="M18 16l6-6h12l6 6" stroke="#B8923F" stroke-width="2"/><path d="M21 30h18M21 36h18" stroke="#B8923F" stroke-width="1.4" stroke-dasharray="2 3"/></svg>`;
  }
  return `<svg viewBox="0 0 60 60" fill="none"><rect x="14" y="24" width="32" height="14" rx="7" stroke="#B8923F" stroke-width="2"/><path d="M30 24v14" stroke="#B8923F" stroke-width="2"/><circle cx="30" cy="14" r="3" stroke="#B8923F" stroke-width="1.6"/><circle cx="22" cy="16" r="2" stroke="#B8923F" stroke-width="1.4"/><circle cx="38" cy="16" r="2" stroke="#B8923F" stroke-width="1.4"/></svg>`;
}

/* ============ SHOP (shop.html only) ============ */
function renderProducts(filter){
  const grid = document.getElementById('productGrid');
  if(!grid) return;
  grid.innerHTML = '';

  if(productsLoadFailed){
    grid.innerHTML = '<p class="cart-empty">The product catalog couldn\'t be loaded. Make sure products.xlsx is published in the same folder as this page.</p>';
    return;
  }
  if(products.length === 0){
    grid.innerHTML = '<p class="cart-empty">Loading products…</p>';
    return;
  }

  const list = filter==='all' ? products : products.filter(p=>p.dosha===filter);
  list.forEach(p=>{
    const chipColor = doshaColor[p.dosha] || doshaColor.tridoshic;
    const chipLabel = doshaLabel[p.dosha] || 'Tridoshic';
    const card = document.createElement('div');
    card.className = 'product-card';
    const bg = `linear-gradient(135deg, ${hexToRgba(chipColor,0.16)}, ${hexToRgba(chipColor,0.045)})`;
    card.innerHTML = `
      <div class="product-media" style="background:${bg}">
        <span class="dosha-chip" style="background:${chipColor}">${chipLabel}</span>
        ${getProductIcon(p.cat)}
      </div>
      <div class="product-body">
        <span class="cat">${p.company ? p.company+' · ' : ''}${p.cat}</span>
        <h3>${p.name}</h3>
        <p class="desc">${p.desc}${p.pack ? ' <br><em>'+p.pack+'</em>' : ''}</p>
        <div class="product-foot">
          <span class="price">$${p.price}</span>
          <button class="add-btn" data-id="${p.id}">Add to cart</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.add-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = products.find(x=>x.id===btn.dataset.id);
      addToCart(p, btn);
    });
  });
}
function wireShopFilters(){
  const el = document.getElementById('shopFilters');
  if(!el) return;
  el.addEventListener('click', e=>{
    const btn = e.target.closest('.filter-btn');
    if(!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderProducts(btn.dataset.filter);
  });
}

/* ============ CART (all pages — persisted so it survives page navigation) ============ */
// Stored as { [productId]: { name, price, qty } } so any page can render the
// cart badge/drawer without needing the full product catalog loaded.
function loadCartFromStorage(){
  try{ return JSON.parse(localStorage.getItem('vajra_cart') || '{}'); }
  catch(e){ return {}; }
}
function saveCartToStorage(){
  localStorage.setItem('vajra_cart', JSON.stringify(cart));
}
let cart = loadCartFromStorage();

function addToCart(product, btn){
  const existing = cart[product.id];
  cart[product.id] = { name: product.name, price: product.price, qty: (existing ? existing.qty : 0) + 1 };
  saveCartToStorage();
  updateCartBadge();
  if(btn){
    btn.textContent = 'Added ✓';
    btn.classList.add('added');
    setTimeout(()=>{ btn.textContent='Add to cart'; btn.classList.remove('added'); }, 1200);
  }
}
function updateCartBadge(){
  const badge = document.getElementById('cartBadge');
  if(!badge) return;
  const count = Object.values(cart).reduce((a,item)=>a+item.qty,0);
  badge.textContent = count;
}
function renderCart(){
  const wrap = document.getElementById('cartItems');
  if(!wrap) return;
  const ids = Object.keys(cart);
  if(ids.length===0){
    wrap.innerHTML = '<p class="cart-empty">Your cart is empty. Browse the shop to add a few remedies.</p>';
    document.getElementById('cartTotal').style.display='none';
    document.getElementById('checkoutNote').style.display='none';
    document.getElementById('checkoutBtn').style.display='none';
    return;
  }
  let total = 0;
  wrap.innerHTML = ids.map(id=>{
    const item = cart[id];
    total += item.price * item.qty;
    return `<div class="cart-row">
      <div>
        <div class="ci-name">${item.name}</div>
        <div class="ci-meta">Qty ${item.qty} · $${item.price} each</div>
      </div>
      <button class="ci-remove" data-id="${id}">Remove</button>
    </div>`;
  }).join('');
  document.getElementById('cartTotal').style.display='flex';
  document.getElementById('cartTotalAmt').textContent = '$'+total.toFixed(2);
  document.getElementById('checkoutNote').style.display='block';
  document.getElementById('checkoutBtn').style.display='flex';
  wrap.querySelectorAll('.ci-remove').forEach(b=>{
    b.addEventListener('click', ()=>{ delete cart[b.dataset.id]; saveCartToStorage(); updateCartBadge(); renderCart(); });
  });
}
function wireCart(){
  const cartBtn = document.getElementById('cartBtn');
  if(!cartBtn) return;
  cartBtn.addEventListener('click', ()=>{
    renderCart();
    renderCartDiscountNote();
    document.getElementById('cartOverlay').classList.add('open');
  });
  document.getElementById('cartClose').addEventListener('click', ()=> document.getElementById('cartOverlay').classList.remove('open'));
  document.getElementById('cartOverlay').addEventListener('click', e=>{
    if(e.target.id==='cartOverlay') document.getElementById('cartOverlay').classList.remove('open');
  });
}

/* ============ CHECKOUT (Stripe) — all pages, since cart/booking checkout can start from any page ============ */
// Set this to your deployed Netlify function URL once you've completed the
// setup in vajra-checkout-function/. Example:
// 'https://vajra-checkout.netlify.app/.netlify/functions/create-checkout-session'
const CHECKOUT_FUNCTION_URL = 'https://delicate-kataifi-aaf865.netlify.app/.netlify/functions/create-checkout-session';

function wireCheckout(){
  const btn = document.getElementById('checkoutBtn');
  if(!btn) return;
  btn.addEventListener('click', async (e)=>{
    const b = e.currentTarget;
    if(!CHECKOUT_FUNCTION_URL || CHECKOUT_FUNCTION_URL.includes('REPLACE_WITH')){
      alert('Checkout isn\'t configured yet. Deploy the checkout function (see vajra-checkout-function/) and set CHECKOUT_FUNCTION_URL in app.js.');
      return;
    }
    const ids = Object.keys(cart);
    if(ids.length === 0) return;
    const items = ids.map(id => ({ name: cart[id].name, price: cart[id].price, quantity: cart[id].qty }));

    const originalText = b.textContent;
    b.textContent = 'Redirecting to secure checkout…';
    b.disabled = true;

    try{
      const res = await fetch(CHECKOUT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'shop',
          items,
          accessToken: currentSession ? currentSession.access_token : null,
          successUrl: window.location.origin + '/shop.html?checkout=success',
          cancelUrl: window.location.origin + '/shop.html?checkout=cancelled',
        }),
      });
      const data = await res.json();
      if(!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url; // redirect to Stripe's hosted checkout page
    }catch(err){
      console.error(err);
      alert('Something went wrong starting checkout: ' + err.message);
      b.textContent = originalText;
      b.disabled = false;
    }
  });
}

function checkoutReturnBanner(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get('checkout');
  const type = params.get('type');
  if(status === 'success' && type === 'consultation'){
    alert('Payment received — your consultation is booked! A confirmation email with the video call link is on its way.');
  } else if(status === 'success'){
    alert('Thank you — your payment was successful! A confirmation email is on its way.');
    cart = {}; saveCartToStorage(); updateCartBadge();
  } else if(status === 'cancelled' && type === 'consultation'){
    alert('Payment was cancelled — your consultation wasn\'t booked. Feel free to try again whenever you\'re ready.');
  } else if(status === 'cancelled'){
    alert('Checkout was cancelled — your cart is still here whenever you\'re ready.');
  }
}

/* ============ CONSULTATION (consultation.html only) ============ */
function renderPractitioners(){
  const grid = document.getElementById('pracGrid');
  const select = document.getElementById('fprac');
  if(!grid) return;

  if(practitionersLoadFailed){
    grid.innerHTML = '<p class="cart-empty">Practitioner list couldn\'t be loaded. Make sure practitioners.xlsx is published in the same folder as this page.</p>';
    return;
  }
  if(practitioners.length === 0){
    grid.innerHTML = '<p class="cart-empty">Loading practitioners…</p>';
    return;
  }

  grid.innerHTML = practitioners.map(pr=>`
    <div class="prac-card">
      <div class="prac-avatar" style="background:${pr.color}">${pr.initials}</div>
      <h4>${pr.name}</h4>
      <span class="cred">${pr.cred}</span>
      <p class="focus">${pr.focus}</p>
      <span class="years">${pr.years}</span>
    </div>`).join('');

  if(select){
    const existingOptions = practitioners.map(pr => `${pr.name} — ${pr.focus}`);
    select.innerHTML = ['No preference — match me with the first available', ...existingOptions]
      .map(label => `<option>${label}</option>`).join('');
  }
}
function wireBookingForm(){
  const form = document.getElementById('bookingForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const panel = document.getElementById('confirmPanel');

    if(!CHECKOUT_FUNCTION_URL || CHECKOUT_FUNCTION_URL.includes('REPLACE_WITH')){
      document.getElementById('confirmText').textContent = 'Booking payments aren\'t configured yet. Deploy the checkout function and set CHECKOUT_FUNCTION_URL in app.js.';
      panel.classList.add('show');
      return;
    }

    const booking = {
      name: document.getElementById('fname').value || 'there',
      email: document.getElementById('femail').value,
      date: document.getElementById('fdate').value,
      time: document.getElementById('ftime').value,
      practitioner: document.getElementById('fprac').value,
      concern: document.getElementById('fconcern').value,
    };

    const originalText = btn.textContent;
    btn.textContent = 'Redirecting to payment…';
    btn.disabled = true;

    try{
      const res = await fetch(CHECKOUT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'consultation',
          booking,
          accessToken: currentSession ? currentSession.access_token : null,
          successUrl: window.location.origin + '/consultation.html?checkout=success&type=consultation',
          cancelUrl: window.location.origin + '/consultation.html?checkout=cancelled&type=consultation',
        }),
      });
      const data = await res.json();
      if(!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
      window.location.href = data.url; // redirect to Stripe's hosted $50 payment page
    }catch(err){
      console.error(err);
      document.getElementById('confirmText').textContent = 'Something went wrong starting payment: ' + err.message;
      panel.classList.add('show');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

/* ============ NAV / INIT (all pages) ============ */
function setActiveNav(){
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a=>{
    a.classList.toggle('active', a.getAttribute('href') === path);
  });
}
function wireMobileMenu(){
  const toggle = document.getElementById('menuToggle');
  if(!toggle) return;
  toggle.addEventListener('click', ()=> document.getElementById('navLinks').classList.toggle('open'));
}

window.addEventListener('DOMContentLoaded', async ()=>{
  setActiveNav();
  wireMobileMenu();
  wireCart();
  updateCartBadge();
  wireAccountModal();
  wireCheckout();
  checkoutReturnBanner();
  initAuth(); // does not block initial render; updates UI once resolved

  if(document.getElementById('productGrid')){
    renderProducts('all'); // shows a "Loading…" state immediately
    wireShopFilters();
    await loadProducts();
    const activeFilter = document.querySelector('.filter-btn.active');
    renderProducts(activeFilter ? activeFilter.dataset.filter : 'all');
  }

  if(document.getElementById('pracGrid')){
    renderPractitioners(); // shows a "Loading…" state immediately
    wireBookingForm();
    await loadPractitioners();
    renderPractitioners();
  }
});
