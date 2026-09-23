const labels = {
  'Courier Packaging Bags': { title: 'Find your next<br>packaging essential.', copy: 'Explore our current packaging range. Select a product to review its purpose and start an enquiry.' },
  'Plastic Granules': { title: 'Masterbatch built for<br>your production line.', copy: 'Explore filling, functional and biodegradable material solutions for film, sheet, pipe, molding and nonwoven applications.' },
  Pillows: { title: 'Comfort made<br>for your market.', copy: 'Build this division with pillow styles, fillings, dimensions and custom packaging options from the admin area.' },
  Headphones: { title: 'Low-latency sound<br>built for play.', copy: 'Explore dual-mode gaming headsets with Bluetooth, 2.4G wireless and 3.5 mm wired connectivity. Minimum order: 100 units.' },
};

let activeDivision = 'Courier Packaging Bags';
let activeFilter = 'all';
let query = '';
let dynamicProducts = [];
let contactWhatsapp = '';

if (window.innerWidth <= 980) {
  document.body.classList.add('nav-closed');
  document.querySelector('#nav-toggle')?.setAttribute('aria-expanded', 'false');
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeImage = value => {
  const text = String(value || '').trim();
  return /^(https?:\/\/|\/)/i.test(text) ? text : '/images/hero-packaging.jpg';
};
const whatsappHref = () => contactWhatsapp ? `https://wa.me/${contactWhatsapp}` : '';

function renderContact() {
  const href = whatsappHref();
  const whatsapp = document.querySelector('#contact-whatsapp');
  const phone = document.querySelector('#contact-phone');
  whatsapp.hidden = !href;
  phone.hidden = !contactWhatsapp;
  if (href) whatsapp.href = href;
  if (contactWhatsapp) {
    phone.href = `tel:+${contactWhatsapp}`;
    phone.textContent = `+${contactWhatsapp}`;
  }
}

function staticPackaging() {
  return (window.PRODUCTS || PRODUCTS || []).map(p => ({ ...p, image: `/${p.image}`, division: 'Courier Packaging Bags' }));
}

function productList() {
  if (dynamicProducts.length) return dynamicProducts;
  return staticPackaging();
}

function filterKey(product) {
  return product.category || 'other';
}

function renderFilters(products) {
  const host = document.querySelector('#filters');
  const names = { all:'All', mailers:'PE mailers', bubble:'Bubble mailers', cushioning:'Cushioning', retail:'Retail & garment', supplies:'Shipping supplies', film:'Film applications', extrusion:'Sheet, pipe & extrusion', molding:'Molding', functional:'Functional masterbatch', sustainable:'Sustainable materials', mineral:'Mineral fillers' };
  const keys = ['all', ...new Set(products.map(filterKey))];
  host.innerHTML = keys.map(key => `<button aria-pressed="${activeFilter === key}" data-filter="${esc(key)}">${esc(names[key] || key)}</button>`).join('');
  host.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { activeFilter = button.dataset.filter; render(); }));
}

function render() {
  const all = productList().filter(p => p.division === activeDivision);
  const visible = all.filter(p => (activeFilter === 'all' || filterKey(p) === activeFilter) && `${p.name} ${p.cn || ''} ${p.description || ''}`.toLowerCase().includes(query));
  const meta = labels[activeDivision];
  document.querySelector('#division-kicker').textContent = activeDivision.toUpperCase();
  document.querySelector('#division-title').innerHTML = meta.title;
  document.querySelector('#division-copy').textContent = meta.copy;
  const brochure = document.querySelector('#division-brochure');
  brochure.hidden = activeDivision !== 'Plastic Granules';
  renderContact();
  renderFilters(all);
  document.querySelector('#count').textContent = all.length ? `${visible.length} of ${all.length} products` : '';
  const grid = document.querySelector('#products');
  const empty = document.querySelector('#empty-division');
  empty.hidden = all.length > 0;
  grid.hidden = all.length === 0;
  grid.innerHTML = visible.map(p => `<article class="product" tabindex="0" data-id="${esc(p.id)}"><div class="product-photo"><img loading="lazy" src="${esc(safeImage(p.image))}" alt="${esc(p.name)}"><span class="product-arrow">↗</span></div><div class="product-body"><span class="product-type">${esc((p.category || activeDivision).toUpperCase())}</span><h3>${esc(p.name)}</h3>${p.cn ? `<p class="cn">${esc(p.cn)}</p>` : ''}<p>${esc(p.description || '')}</p></div></article>`).join('');
  grid.querySelectorAll('.product').forEach(card => { const open = () => showDetail(visible.find(p => String(p.id) === card.dataset.id)); card.addEventListener('click', open); card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); }); });
}

function showDetail(p) {
  if (!p) return;
  const enquiry = whatsappHref() ? `<a class="button" href="${esc(whatsappHref())}" target="_blank" rel="noopener">Ask about this product ↗</a>` : '';
  document.querySelector('#detail-content').innerHTML = `<img src="${esc(safeImage(p.image))}" alt="${esc(p.name)}"><div><span class="eyebrow">${esc((p.category || activeDivision).toUpperCase())}</span><h2>${esc(p.name)}</h2>${p.cn ? `<p class="cn">${esc(p.cn)}</p>` : ''}<p>${esc(p.description || '')}</p>${enquiry}</div>`;
  document.querySelector('#detail').showModal();
}

async function loadStorefront() {
  try {
    const response = await fetch('/api/storefront', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    const products = payload.data?.products || [];
    if (products.length) dynamicProducts = products;
    const settings = payload.data?.settings || {};
    contactWhatsapp = String(settings.contact_whatsapp || '').replace(/\D/g, '').slice(0, 15);
    if (settings.home_site_name) document.querySelectorAll('.brand span:last-child').forEach(el => { el.childNodes[0].nodeValue = settings.home_site_name; });
    if (settings.home_site_description) document.querySelector('.hero .intro').textContent = settings.home_site_description;
  } catch (_) { /* Static catalogue stays available if the API is not configured yet. */ }
}

document.querySelector('#nav-toggle').addEventListener('click', () => {
  const closed = document.body.classList.toggle('nav-closed');
  document.querySelector('#nav-toggle').setAttribute('aria-expanded', String(!closed));
});
document.querySelectorAll('.division').forEach(button => button.addEventListener('click', () => {
  activeDivision = button.dataset.division; activeFilter = 'all';
  document.querySelectorAll('.division').forEach(b => b.classList.toggle('active', b === button));
  document.querySelector('#collection').scrollIntoView({ behavior: 'smooth' }); render();
}));
document.querySelector('#search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); render(); });
document.querySelector('#detail .close').addEventListener('click', () => document.querySelector('#detail').close());
document.querySelector('#detail').addEventListener('click', event => { if (event.target.id === 'detail') event.target.close(); });

render();
loadStorefront().then(render);
