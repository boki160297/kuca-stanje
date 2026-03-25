// ---- Dark Mode (apply immediately) ----
(function() {
    const saved = localStorage.getItem('kuca_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

const CATEGORY_ICONS = {
    'Voće i povrće': '🥬', 'Mlijeko i mliječni': '🥛', 'Meso i riba': '🥩',
    'Pekara': '🍞', 'Piće': '🥤', 'Začini': '🧂', 'Konzerve': '🥫',
    'Slatkiši': '🍫', 'Smrznuto': '🧊', 'Higijena': '🧴', 'Ostalo': '📦'
};

const CATEGORY_COLORS = {
    'Voće i povrće': '#dcfce7', 'Mlijeko i mliječni': '#e0f2fe', 'Meso i riba': '#fee2e2',
    'Pekara': '#fef3c7', 'Piće': '#fce7f3', 'Začini': '#f3e8ff', 'Konzerve': '#ffedd5',
    'Slatkiši': '#fce7f3', 'Smrznuto': '#e0f2fe', 'Higijena': '#f0fdf4', 'Ostalo': '#f3f4f6'
};

// ---- State ----
let inventory = [];
let shoppingList = [];
let activeTab = 'inventar';
let activeCategory = null;
let currentUser = null;

// ---- API Helper ----
function getToken() {
    return localStorage.getItem('kuca_token');
}

async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Greška na serveru');
    return data;
}

// ---- DOM refs ----
const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const userDisplay = document.getElementById('user-display');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const inventarList = document.getElementById('inventar-list');
const kupovinaList = document.getElementById('kupovina-list');
const inventarCount = document.getElementById('inventar-count');
const kupovinaCount = document.getElementById('kupovina-count');
const searchInventar = document.getElementById('search-inventar');
const searchKupovina = document.getElementById('search-kupovina');
const categoryFilters = document.getElementById('category-filters');
const shoppingActions = document.getElementById('shopping-actions');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const itemForm = document.getElementById('item-form');
const itemName = document.getElementById('item-name');
const itemQty = document.getElementById('item-qty');
const itemUnit = document.getElementById('item-unit');
const itemCategory = document.getElementById('item-category');
const itemId = document.getElementById('item-id');
const itemTarget = document.getElementById('item-target');
const formBtnText = document.getElementById('form-btn-text');
const suggestionsEl = document.getElementById('suggestions');
const inventoryNotice = document.getElementById('inventory-notice');
const itemExpires = document.getElementById('item-expires');
const expiryGroup = document.getElementById('expiry-group');
const expiryWarnings = document.getElementById('expiry-warnings');

const consumeOverlay = document.getElementById('modal-consume-overlay');
const consumeForm = document.getElementById('consume-form');
const consumeQty = document.getElementById('consume-qty');
const consumeId = document.getElementById('consume-id');
const consumeInfo = document.getElementById('consume-info');

// ---- Helpers ----
function formatQty(qty) {
    return qty % 1 === 0 ? qty.toString() : qty.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getExpiryStatus(expiresAt) {
    if (!expiresAt) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiresAt);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `Isteklo prije ${Math.abs(diffDays)} dana`, class: 'expired', days: diffDays };
    if (diffDays === 0) return { label: 'Ističe danas!', class: 'expiring-today', days: 0 };
    if (diffDays <= 3) return { label: `Ističe za ${diffDays} dana`, class: 'expiring-soon', days: diffDays };
    if (diffDays <= 7) return { label: `Ističe za ${diffDays} dana`, class: 'expiring-week', days: diffDays };
    return { label: formatDate(expiresAt), class: 'expiry-ok', days: diffDays };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// =====================
//   AUTH
// =====================

const authTabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.auth === 'login') {
            loginForm.style.display = '';
            registerForm.style.display = 'none';
        } else {
            loginForm.style.display = 'none';
            registerForm.style.display = '';
        }
        loginError.textContent = '';
        registerError.textContent = '';
    });
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const login = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const data = await api('POST', '/auth/login', { login, password });
        localStorage.setItem('kuca_token', data.token);
        currentUser = data.user;
        showApp();
    } catch (err) {
        loginError.textContent = err.message;
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    try {
        const data = await api('POST', '/auth/register', { username, email, password });
        localStorage.setItem('kuca_token', data.token);
        currentUser = data.user;
        showApp();
    } catch (err) {
        registerError.textContent = err.message;
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('kuca_token');
    currentUser = null;
    inventory = [];
    shoppingList = [];
    authScreen.style.display = '';
    mainApp.style.display = 'none';
});

async function checkAuth() {
    const token = getToken();
    if (!token) return;
    try {
        const data = await api('GET', '/auth/me');
        currentUser = data.user;
        showApp();
    } catch {
        localStorage.removeItem('kuca_token');
    }
}

async function showApp() {
    authScreen.style.display = 'none';
    mainApp.style.display = '';
    userDisplay.textContent = currentUser.username;
    await loadData();
}

async function loadData() {
    try {
        const [inv, shop] = await Promise.all([
            api('GET', '/inventory'),
            api('GET', '/shopping')
        ]);
        inventory = inv;
        shoppingList = shop;
    } catch (err) {
        console.error('Greška pri učitavanju:', err);
    }
    renderInventory();
    renderShoppingList();
}

// ---- Tabs ----
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabContents.forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${activeTab}`).classList.add('active');
    });
});

// ---- Render Inventory ----
function renderInventory() {
    const search = searchInventar.value.toLowerCase().trim();
    let items = inventory.slice();

    if (search) {
        items = items.filter(item => item.name.toLowerCase().includes(search));
    }
    if (activeCategory) {
        items = items.filter(item => item.category === activeCategory);
    }

    inventarCount.textContent = inventory.length;
    renderExpiryWarnings();
    renderCategoryFilters();

    if (items.length === 0) {
        const isFiltered = search || activeCategory;
        inventarList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 7h-9"/><path d="M14 17H5"/>
                    <circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
                </svg>
                <p>${isFiltered ? 'Nema rezultata' : 'Inventar je prazan'}</p>
                <span>${isFiltered ? 'Pokušajte drugi pojam za pretragu' : 'Dodajte prvu namirnicu klikom na "Dodaj"'}</span>
            </div>`;
        return;
    }

    items.sort((a, b) => {
        const c = a.category.localeCompare(b.category);
        return c !== 0 ? c : a.name.localeCompare(b.name);
    });

    let html = '';
    items.forEach(item => { html += renderInventoryCard(item); });
    inventarList.innerHTML = html;
    bindInventoryActions();
}

function renderExpiryWarnings() {
    const warnings = inventory
        .map(item => ({ ...item, expiry: getExpiryStatus(item.expires_at) }))
        .filter(item => item.expiry && item.expiry.days <= 3)
        .sort((a, b) => a.expiry.days - b.expiry.days);

    if (warnings.length === 0) {
        expiryWarnings.innerHTML = '';
        return;
    }

    let html = '<div class="expiry-panel">';
    html += `<div class="expiry-panel-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Upozorenje: ${warnings.length} namirnica ističe uskoro
    </div>`;

    warnings.forEach(item => {
        const icon = CATEGORY_ICONS[item.category] || '📦';
        html += `<div class="expiry-item ${item.expiry.class}">
            <span>${icon} ${escapeHtml(item.name)}</span>
            <span class="expiry-label">${item.expiry.label}</span>
        </div>`;
    });

    html += '</div>';
    expiryWarnings.innerHTML = html;
}

function renderInventoryCard(item) {
    const icon = CATEGORY_ICONS[item.category] || '📦';
    const color = CATEGORY_COLORS[item.category] || '#f3f4f6';
    const expiry = getExpiryStatus(item.expires_at);
    let expiryBadge = '';
    if (expiry) {
        expiryBadge = `<div class="expiry-badge ${expiry.class}">${expiry.label}</div>`;
    }

    return `
    <div class="item-card ${expiry && expiry.days < 0 ? 'card-expired' : ''}" data-id="${item.id}">
        <div class="item-icon" style="background:${color}">${icon}</div>
        <div class="item-info">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${item.category}${expiryBadge}</div>
        </div>
        <div class="item-qty-badge">${formatQty(item.quantity)} ${item.unit}</div>
        <div class="item-actions">
            <button class="btn-icon consume" title="Potroši" data-id="${item.id}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14"/>
                </svg>
            </button>
            <button class="btn-icon edit" title="Uredi" data-id="${item.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
            </button>
            <button class="btn-icon delete" title="Obriši" data-id="${item.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
            </button>
        </div>
    </div>`;
}

function bindInventoryActions() {
    inventarList.querySelectorAll('.btn-icon.consume').forEach(btn => {
        btn.addEventListener('click', () => openConsumeModal(btn.dataset.id));
    });
    inventarList.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id, 'inventar'));
    });
    inventarList.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Obrisati ovu namirnicu iz inventara?')) return;
            try {
                await api('DELETE', `/inventory/${btn.dataset.id}`);
                inventory = inventory.filter(i => i.id != btn.dataset.id);
                renderInventory();
            } catch (err) { alert(err.message); }
        });
    });
}

// ---- Category Filters ----
function renderCategoryFilters() {
    const categories = [...new Set(inventory.map(i => i.category))].sort();
    if (categories.length <= 1) {
        categoryFilters.innerHTML = '';
        return;
    }
    let html = `<button class="category-chip ${!activeCategory ? 'active' : ''}" data-cat="">Sve</button>`;
    categories.forEach(cat => {
        const icon = CATEGORY_ICONS[cat] || '📦';
        html += `<button class="category-chip ${activeCategory === cat ? 'active' : ''}" data-cat="${cat}">${icon} ${cat}</button>`;
    });
    categoryFilters.innerHTML = html;

    categoryFilters.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            activeCategory = chip.dataset.cat || null;
            renderInventory();
        });
    });
}

// ---- Render Shopping List ----
function renderShoppingList() {
    const search = searchKupovina.value.toLowerCase().trim();
    let items = shoppingList.slice();

    if (search) {
        items = items.filter(item => item.name.toLowerCase().includes(search));
    }

    kupovinaCount.textContent = shoppingList.length;
    shoppingActions.style.display = shoppingList.length > 0 ? 'flex' : 'none';

    if (items.length === 0) {
        kupovinaList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
                </svg>
                <p>${search ? 'Nema rezultata' : 'Lista za kupovinu je prazna'}</p>
                <span>${search ? 'Pokušajte drugi pojam' : 'Dodajte namirnice koje trebate kupiti'}</span>
            </div>`;
        return;
    }

    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    let html = '';
    [...unchecked, ...checked].forEach(item => { html += renderShoppingCard(item); });
    kupovinaList.innerHTML = html;
    bindShoppingActions();
}

function renderShoppingCard(item) {
    const icon = CATEGORY_ICONS[item.category] || '📦';
    const color = CATEGORY_COLORS[item.category] || '#f3f4f6';
    const inInventory = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase());
    let hint = '';
    if (inInventory) {
        hint = `<div class="inventory-hint">Imate: ${formatQty(inInventory.quantity)} ${inInventory.unit}</div>`;
    }

    return `
    <div class="item-card ${item.checked ? 'checked' : ''}" data-id="${item.id}">
        <div class="item-checkbox ${item.checked ? 'checked' : ''}" data-id="${item.id}"></div>
        <div class="item-icon" style="background:${color}">${icon}</div>
        <div class="item-info">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${formatQty(item.quantity)} ${item.unit} · ${item.category}</div>
        </div>
        ${hint}
        <div class="item-actions">
            <button class="btn-icon edit" title="Uredi" data-id="${item.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
            </button>
            <button class="btn-icon delete" title="Obriši" data-id="${item.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
            </button>
        </div>
    </div>`;
}

function bindShoppingActions() {
    kupovinaList.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.addEventListener('click', async () => {
            try {
                const updated = await api('PATCH', `/shopping/${cb.dataset.id}/toggle`);
                const idx = shoppingList.findIndex(i => i.id == cb.dataset.id);
                if (idx !== -1) shoppingList[idx] = updated;
                renderShoppingList();
            } catch (err) { alert(err.message); }
        });
    });
    kupovinaList.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id, 'kupovina'));
    });
    kupovinaList.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await api('DELETE', `/shopping/${btn.dataset.id}`);
                shoppingList = shoppingList.filter(i => i.id != btn.dataset.id);
                renderShoppingList();
            } catch (err) { alert(err.message); }
        });
    });
}

// ---- Shopping Bulk Actions ----
document.getElementById('btn-kupljeno-sve').addEventListener('click', async () => {
    const checkedItems = shoppingList.filter(i => i.checked);
    if (checkedItems.length === 0) {
        alert('Prvo označite kupljene namirnice (kliknite kvačicu).');
        return;
    }
    try {
        const result = await api('POST', '/shopping/buy-checked');
        await loadData();
        alert(`${result.moved} namirnica dodano u inventar!`);
    } catch (err) { alert(err.message); }
});

document.getElementById('btn-obrisi-kupljeno').addEventListener('click', async () => {
    const checkedItems = shoppingList.filter(i => i.checked);
    if (checkedItems.length === 0) {
        alert('Nema označenih namirnica za brisanje.');
        return;
    }
    if (!confirm(`Obrisati ${checkedItems.length} označenih namirnica s liste?`)) return;
    try {
        await api('DELETE', '/shopping/checked');
        shoppingList = shoppingList.filter(i => !i.checked);
        renderShoppingList();
    } catch (err) { alert(err.message); }
});

// ---- Modal: Add / Edit ----
function openAddModal(target) {
    modalTitle.textContent = target === 'inventar' ? 'Dodaj u inventar' : 'Dodaj na listu';
    formBtnText.textContent = 'Dodaj';
    itemForm.reset();
    itemId.value = '';
    itemTarget.value = target;
    itemExpires.value = '';
    expiryGroup.style.display = target === 'inventar' ? '' : 'none';
    inventoryNotice.style.display = 'none';
    modalOverlay.classList.add('open');
    setTimeout(() => itemName.focus(), 200);
}

function openEditModal(id, target) {
    const list = target === 'inventar' ? inventory : shoppingList;
    const item = list.find(i => i.id == id);
    if (!item) return;

    modalTitle.textContent = 'Uredi namirnicu';
    formBtnText.textContent = 'Spremi';
    itemName.value = item.name;
    itemQty.value = item.quantity;
    itemUnit.value = item.unit;
    itemCategory.value = item.category;
    itemExpires.value = item.expires_at ? item.expires_at.split('T')[0] : '';
    expiryGroup.style.display = target === 'inventar' ? '' : 'none';
    itemId.value = item.id;
    itemTarget.value = target;
    inventoryNotice.style.display = 'none';
    modalOverlay.classList.add('open');
    setTimeout(() => itemName.focus(), 200);
}

function closeModal() {
    modalOverlay.classList.remove('open');
    suggestionsEl.classList.remove('open');
}

document.getElementById('btn-add-inventar').addEventListener('click', () => openAddModal('inventar'));
document.getElementById('btn-add-kupovina').addEventListener('click', () => openAddModal('kupovina'));
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = itemName.value.trim();
    const quantity = parseFloat(itemQty.value);
    const unit = itemUnit.value;
    const category = itemCategory.value;
    const expires_at = itemExpires.value || null;
    const id = itemId.value;
    const target = itemTarget.value;

    if (!name || !quantity || quantity <= 0) return;

    try {
        if (target === 'inventar') {
            if (id) {
                await api('PUT', `/inventory/${id}`, { name, quantity, unit, category, expires_at });
            } else {
                await api('POST', '/inventory', { name, quantity, unit, category, expires_at });
            }
        } else {
            if (id) {
                await api('PUT', `/shopping/${id}`, { name, quantity, unit, category });
            } else {
                await api('POST', '/shopping', { name, quantity, unit, category });
            }
        }
        await loadData();
        closeModal();
    } catch (err) {
        alert(err.message);
    }
});

// ---- Suggestions ----
itemName.addEventListener('input', () => {
    const val = itemName.value.toLowerCase().trim();
    const target = itemTarget.value;

    if (target === 'kupovina' && val.length >= 1) {
        const matches = inventory.filter(i => i.name.toLowerCase().includes(val)).slice(0, 5);

        if (matches.length > 0) {
            suggestionsEl.innerHTML = matches.map(m => `
                <div class="suggestion-item" data-name="${escapeHtml(m.name)}" data-unit="${m.unit}" data-category="${m.category}">
                    ${CATEGORY_ICONS[m.category] || '📦'} ${escapeHtml(m.name)}
                    <span class="suggestion-qty">(imate: ${formatQty(m.quantity)} ${m.unit})</span>
                </div>
            `).join('');
            suggestionsEl.classList.add('open');

            suggestionsEl.querySelectorAll('.suggestion-item').forEach(si => {
                si.addEventListener('click', () => {
                    itemName.value = si.dataset.name;
                    itemUnit.value = si.dataset.unit;
                    itemCategory.value = si.dataset.category;
                    suggestionsEl.classList.remove('open');
                    checkInventoryNotice(si.dataset.name);
                    itemQty.focus();
                });
            });
        } else {
            suggestionsEl.classList.remove('open');
        }
        checkInventoryNotice(val);
    } else {
        suggestionsEl.classList.remove('open');
        inventoryNotice.style.display = 'none';
    }
});

itemName.addEventListener('blur', () => {
    setTimeout(() => suggestionsEl.classList.remove('open'), 200);
});

function checkInventoryNotice(name) {
    const match = inventory.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (match) {
        inventoryNotice.textContent = `Već imate: ${formatQty(match.quantity)} ${match.unit} u inventaru`;
        inventoryNotice.className = 'inventory-notice has-stock';
        inventoryNotice.style.display = 'block';
    } else {
        inventoryNotice.style.display = 'none';
    }
}

// ---- Consume Modal ----
function openConsumeModal(id) {
    const item = inventory.find(i => i.id == id);
    if (!item) return;

    consumeInfo.innerHTML = `<strong>${escapeHtml(item.name)}</strong> — trenutno: ${formatQty(item.quantity)} ${item.unit}`;
    consumeQty.value = '';
    consumeQty.max = item.quantity;
    consumeQty.placeholder = `max ${formatQty(item.quantity)}`;
    consumeId.value = id;
    consumeOverlay.classList.add('open');
    setTimeout(() => consumeQty.focus(), 200);
}

function closeConsumeModal() {
    consumeOverlay.classList.remove('open');
}

document.getElementById('btn-close-consume').addEventListener('click', closeConsumeModal);
consumeOverlay.addEventListener('click', (e) => { if (e.target === consumeOverlay) closeConsumeModal(); });

consumeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = consumeId.value;
    const amount = parseFloat(consumeQty.value);
    if (!amount || amount <= 0) return;

    try {
        await api('PATCH', `/inventory/${id}/consume`, { amount });
        await loadData();
        closeConsumeModal();
    } catch (err) { alert(err.message); }
});

document.getElementById('btn-remove-all').addEventListener('click', async () => {
    const id = consumeId.value;
    try {
        await api('DELETE', `/inventory/${id}`);
        await loadData();
        closeConsumeModal();
    } catch (err) { alert(err.message); }
});

// ---- Search ----
searchInventar.addEventListener('input', renderInventory);
searchKupovina.addEventListener('input', renderShoppingList);

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeConsumeModal();
    }
});

// ---- Dark Mode Toggle ----
const btnTheme = document.getElementById('btn-theme');
const iconSun = document.getElementById('icon-sun');
const iconMoon = document.getElementById('icon-moon');

function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    iconSun.style.display = isDark ? 'none' : '';
    iconMoon.style.display = isDark ? '' : 'none';
}

btnTheme.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('kuca_theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('kuca_theme', 'dark');
    }
    updateThemeIcons();
});

updateThemeIcons();

// ---- PWA: Service Worker + Install ----
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

let deferredPrompt = null;
const installBanner = document.getElementById('install-banner');
const btnInstall = document.getElementById('btn-install');
const btnDismiss = document.getElementById('btn-install-dismiss');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
});

function showInstallBanner() {
    if (localStorage.getItem('kuca_install_dismissed')) return;
    installBanner.style.display = 'flex';
}

btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBanner.style.display = 'none';
        }
        deferredPrompt = null;
    } else {
        showManualInstallInstructions();
    }
});

btnDismiss.addEventListener('click', () => {
    installBanner.style.display = 'none';
    localStorage.setItem('kuca_install_dismissed', 'true');
});

window.addEventListener('appinstalled', () => {
    installBanner.style.display = 'none';
    deferredPrompt = null;
});

function showManualInstallInstructions() {
    const ua = navigator.userAgent;
    let msg = '';
    if (/iPhone|iPad|iPod/.test(ua)) {
        msg = 'U Safariju: klikni Share dugme (kvadrat sa strelicom) → "Dodaj na početni zaslon"';
    } else if (/Android/.test(ua)) {
        msg = 'U Chromeu: klikni ⋮ (tri tačke gore desno) → "Dodaj na početni ekran" ili "Instaliraj aplikaciju"';
    } else {
        msg = 'U browseru: klikni na ikonu instalacije u address baru ili u meniju browsera potražite "Instaliraj"';
    }
    alert('Kako instalirati:\n\n' + msg);
}

// Show install banner after login if not installed and not dismissed
const originalShowApp = showApp;
showApp = async function() {
    await originalShowApp();
    if (!window.matchMedia('(display-mode: standalone)').matches && !localStorage.getItem('kuca_install_dismissed')) {
        installBanner.style.display = 'flex';
    }
};

// ---- Init ----
checkAuth();
