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
let cookbookRecipes = [];
let mealPlan = [];
let activePage = 'pocetna';
let selectedCategory = null;
let selectedRecipeId = null;
let lastAiRecipe = null;
let currentUser = null;

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}
let planerWeekStart = getMonday(new Date());

const DAY_SHORT = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];
const MEAL_TYPES = [
    { id: 'dorucak', label: 'Doručak', icon: '🌅' },
    { id: 'rucak', label: 'Ručak', icon: '☀️' },
    { id: 'vecera', label: 'Večera', icon: '🌙' }
];

// ---- API Helper ----
function getToken() { return localStorage.getItem('kuca_token'); }

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

// ---- DOM Refs ----
const authScreen = document.getElementById('auth-screen');
const mainApp = document.getElementById('main-app');
const userDisplay = document.getElementById('user-display');
const topBarTitle = document.getElementById('top-bar-title');
const btnBack = document.getElementById('btn-back');
const contentEl = document.getElementById('content');

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

const greetingDate = document.getElementById('greeting-date');
const statInventar = document.getElementById('stat-inventar');
const statKupovina = document.getElementById('stat-kupovina');
const statExpiry = document.getElementById('stat-expiry');
const expiryWarnings = document.getElementById('expiry-warnings');
const cookSuggestionEl = document.getElementById('cook-suggestion');
const cookSuggestionMsg = document.getElementById('cook-suggestion-msg');
const cookSuggestionHint = document.getElementById('cook-suggestion-hint');
const cookSuggestionHintText = document.getElementById('cook-suggestion-hint-text');
const btnCookSuggestion = document.getElementById('btn-cook-suggestion');
const btnCookShopping = document.getElementById('btn-cook-shopping');

const inventarCount = document.getElementById('inventar-count');
const kupovinaCount = document.getElementById('kupovina-count');

const categoriesGrid = document.getElementById('categories-grid');
const inventarCategoriesView = document.getElementById('inventar-categories-view');
const inventarItemsView = document.getElementById('inventar-items-view');
const categoryViewHeader = document.getElementById('category-view-header');
const inventarList = document.getElementById('inventar-list');
const inventarSearchResults = document.getElementById('inventar-search-results');
const searchInventar = document.getElementById('search-inventar');
const searchCategoryItems = document.getElementById('search-category-items');

const kupovinaList = document.getElementById('kupovina-list');
const searchKupovina = document.getElementById('search-kupovina');
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

function findInventoryMatch(ingredientName) {
    const normalize = s => s.toLowerCase().trim();
    const name = normalize(ingredientName);

    function wordRoot(w) {
        if (w.length <= 3) return w;
        const suffixes = ['ama','ima','ica','ice','aci','aca','ene','enih','enom',
            'om','em','im','og','oj','ih','ne','na','no','ni','ke','ka','ki','ce','ca','ci',
            'a','e','i','u','o'];
        for (const suf of suffixes) {
            if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
        }
        return w;
    }

    function wordsMatch(w1, w2) {
        if (w1 === w2) return true;
        const r1 = wordRoot(w1), r2 = wordRoot(w2);
        if (r1 === r2) return true;
        if (r1.length >= 3 && r2.length >= 3 && (r1.startsWith(r2) || r2.startsWith(r1))) return true;
        return false;
    }

    const nameWords = name.split(/\s+/).filter(w => w.length > 0);

    return inventory.find(i => {
        const invName = normalize(i.name);
        if (invName === name) return true;
        if (invName.includes(name) || name.includes(invName)) return true;
        const invWords = invName.split(/\s+/).filter(w => w.length > 0);
        if (nameWords.length === 0 || invWords.length === 0) return false;
        const matched = nameWords.filter(nw => invWords.some(iw => wordsMatch(nw, iw))).length;
        const minWords = Math.min(nameWords.length, invWords.length);
        return matched >= minWords && matched > 0;
    });
}

function recipeIngredientsArray(recipe) {
    if (!recipe || !recipe.ingredients) return [];
    try {
        const ings = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
        return Array.isArray(ings) ? ings.filter(i => i && String(i.name || '').trim()) : [];
    } catch {
        return [];
    }
}

function parseIngredientQtyUnit(amountStr) {
    const raw = (amountStr || '').trim().toLowerCase();
    if (!raw) return { quantity: 1, unit: 'kom' };
    const m = raw.match(/^([\d.,]+)\s*(.*)$/);
    if (m) {
        let q = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
        if (Number.isNaN(q) || q <= 0) q = 1;
        let unit = (m[2] || '').trim();
        if (!unit) unit = 'kom';
        return { quantity: q, unit };
    }
    return { quantity: 1, unit: raw || 'kom' };
}

function normalizeListName(s) {
    return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function shoppingListHasIngredient(ingredientName) {
    const n = normalizeListName(ingredientName);
    return shoppingList.some(item => normalizeListName(item.name) === n);
}

/** Vraća { added, skipped } nakon API poziva; osvježi listu ako refresh !== false */
async function addMissingIngredientsToShopping(recipe, { refresh = true } = {}) {
    const ingredients = recipeIngredientsArray(recipe);
    const missing = ingredients.filter(ing => !findInventoryMatch(ing.name));
    let added = 0;
    let skipped = 0;
    const cat = recipe.category || 'Ostalo';
    for (const ing of missing) {
        if (shoppingListHasIngredient(ing.name)) {
            skipped++;
            continue;
        }
        const { quantity, unit } = parseIngredientQtyUnit(ing.amount);
        try {
            await api('POST', '/shopping', {
                name: String(ing.name).trim(),
                quantity,
                unit,
                category: cat
            });
            added++;
        } catch (e) {
            console.error(e);
        }
    }
    if (refresh) await loadData();
    return { added, skipped };
}

function sastojakRijec(n) {
    const x = Math.abs(n) % 100;
    const z = x % 10;
    if (x >= 11 && x <= 14) return 'sastojaka';
    if (z === 1) return 'sastojak';
    if (z >= 2 && z <= 4) return 'sastojka';
    return 'sastojaka';
}

function namirniceListaMsg(n) {
    if (n === 1) return '1 namirnica dodana na listu za kupovinu.';
    if (n >= 2 && n <= 4) return `${n} namirnice dodane na listu za kupovinu.`;
    return `${n} namirnica dodano na listu za kupovinu.`;
}

function vecNaListiMsg(n) {
    if (n === 1) return 'Jedna je već bila na listi.';
    return `${n} ih je već bilo na listi.`;
}

function pickTodayCookSuggestion() {
    if (!cookbookRecipes.length) return { type: 'empty' };

    const scored = [];
    for (const r of cookbookRecipes) {
        const ings = recipeIngredientsArray(r);
        if (ings.length === 0) continue;
        const missing = ings.filter(ing => !findInventoryMatch(ing.name));
        const haveCount = ings.length - missing.length;
        if (haveCount === 0) continue;
        scored.push({
            recipe: r,
            ingredients: ings,
            missing,
            missingCount: missing.length,
            haveCount
        });
    }

    if (scored.length === 0) return { type: 'no_overlap' };

    const ideal = scored.filter(s => s.missingCount >= 1 && s.missingCount <= 4);
    let pool = ideal.length ? ideal : scored.filter(s => s.missingCount === 0);
    if (!pool.length) pool = scored.slice();

    pool.sort((a, b) => {
        if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
        return b.haveCount - a.haveCount;
    });

    const best = pool[0];
    return { type: 'ok', ...best };
}

function getGreetingDate() {
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const d = new Date().toLocaleDateString('hr-HR', opts);
    return d.charAt(0).toUpperCase() + d.slice(1);
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
    } catch (err) { loginError.textContent = err.message; }
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
    } catch (err) { registerError.textContent = err.message; }
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
    } catch { localStorage.removeItem('kuca_token'); }
}

async function showApp() {
    authScreen.style.display = 'none';
    mainApp.style.display = '';
    userDisplay.textContent = currentUser.username;
    greetingDate.textContent = getGreetingDate();
    await loadData();

    if (!window.matchMedia('(display-mode: standalone)').matches && !localStorage.getItem('kuca_install_dismissed')) {
        document.getElementById('install-banner').style.display = 'flex';
    }
}

async function loadData() {
    try {
        const [inv, shop] = await Promise.all([
            api('GET', '/inventory'),
            api('GET', '/shopping')
        ]);
        inventory = inv;
        shoppingList = shop;
    } catch (err) { console.error('Greška pri učitavanju:', err); }
    try {
        cookbookRecipes = await api('GET', '/cookbook');
    } catch (err) { cookbookRecipes = []; }
    await loadMealPlan();
    renderAll();
}

function formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function loadMealPlan() {
    const end = new Date(planerWeekStart);
    end.setDate(end.getDate() + 6);
    try {
        mealPlan = await api('GET', `/meal-plan?start=${formatDateISO(planerWeekStart)}&end=${formatDateISO(end)}`);
    } catch { mealPlan = []; }
}

function renderAll() {
    renderDashboard();
    renderPlaner();
    renderCategoriesGrid();
    renderShoppingList();
    renderCookbookList();
    updateNavBadges();
}

// =====================
//   NAVIGATION
// =====================
const PAGE_TITLES = {
    pocetna: 'Moja Smočnica',
    inventar: 'Smočnica',
    kupovina: 'Kupovina',
    kuharica: 'Kuharica',
    planer: 'Planer obroka',
    recepti: 'Čarobni Kuhar'
};

function navigateTo(page) {
    activePage = page;

    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    navItems.forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    const hasSubView = (page === 'inventar' && selectedCategory) || (page === 'kuharica' && selectedRecipeId);
    if (page === 'inventar' && selectedCategory) {
        topBarTitle.textContent = selectedCategory === '__all__' ? '📋 Sve namirnice' : `${CATEGORY_ICONS[selectedCategory] || '📦'} ${selectedCategory}`;
        btnBack.style.display = '';
    } else if (page === 'kuharica' && selectedRecipeId) {
        const r = cookbookRecipes.find(r => r.id == selectedRecipeId);
        topBarTitle.textContent = r ? r.title : 'Recept';
        btnBack.style.display = '';
    } else {
        topBarTitle.textContent = PAGE_TITLES[page] || page;
        btnBack.style.display = 'none';
    }

    if (page === 'inventar' && !selectedCategory) showCategoriesView();
    if (page === 'kuharica' && !selectedRecipeId) showCookbookListView();

    contentEl.scrollTop = 0;
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        selectedCategory = null;
        selectedRecipeId = null;
        navigateTo(item.dataset.page);
    });
});

btnBack.addEventListener('click', () => {
    if (activePage === 'inventar' && selectedCategory) {
        selectedCategory = null;
        showCategoriesView();
        topBarTitle.textContent = PAGE_TITLES.inventar;
        btnBack.style.display = 'none';
    } else if (activePage === 'kuharica' && selectedRecipeId) {
        selectedRecipeId = null;
        showCookbookListView();
        topBarTitle.textContent = PAGE_TITLES.kuharica;
        btnBack.style.display = 'none';
    }
});

document.querySelectorAll('.stat-card[data-goto]').forEach(card => {
    card.addEventListener('click', () => {
        selectedCategory = null;
        navigateTo(card.dataset.goto);
    });
});

// =====================
//   DASHBOARD
// =====================
function renderDashboard() {
    statInventar.textContent = inventory.length;
    statKupovina.textContent = shoppingList.length;

    const expiringItems = inventory.filter(item => {
        const s = getExpiryStatus(item.expires_at);
        return s && s.days <= 3;
    });
    statExpiry.textContent = expiringItems.length;
    document.getElementById('stat-card-expiry').style.display = expiringItems.length > 0 ? '' : 'none';

    renderExpiryWarnings();
    renderCookSuggestion();
}

function renderCookSuggestion() {
    if (!cookSuggestionEl || !cookSuggestionHint) return;

    cookSuggestionEl.style.display = 'none';
    cookSuggestionHint.style.display = 'none';
    delete cookSuggestionEl.dataset.recipeId;

    const pick = pickTodayCookSuggestion();

    if (pick.type === 'empty') {
        cookSuggestionHintText.textContent =
            'Dodaj recept u kuharicu (ručno ili iz Čarobnog kuhara) pa ćemo predložiti jelo prema tvojoj smočnici.';
        cookSuggestionHint.style.display = '';
        return;
    }
    if (pick.type === 'no_overlap') {
        cookSuggestionHintText.textContent =
            'Još nema prijedloga — u tvojim receptima nema namirnica koje trenutno imaš u smočnici. Dodaj namirnice ili prilagodi recepte.';
        cookSuggestionHint.style.display = '';
        return;
    }

    const title = escapeHtml(pick.recipe.title);
    let html;
    if (pick.missingCount === 0) {
        html = `Imaš sve sastojke za <strong>${title}</strong> — možeš krenuti odmah.`;
    } else if (pick.missingCount === 1) {
        html = `Možeš kuhati <strong>${title}</strong> — u smočnici ti još fali <strong>1 sastojak</strong>.`;
    } else {
        const w = sastojakRijec(pick.missingCount);
        const samo = pick.missingCount <= 4 ? 'samo ' : '';
        html = `Možeš kuhati <strong>${title}</strong> — fale ti još ${samo}<strong>${pick.missingCount}</strong> ${w}.`;
    }
    cookSuggestionMsg.innerHTML = html;
    cookSuggestionEl.dataset.recipeId = String(pick.recipe.id);
    cookSuggestionEl.style.display = '';
    if (btnCookShopping) {
        btnCookShopping.style.display = pick.missingCount > 0 ? '' : 'none';
    }
}

function renderExpiryWarnings() {
    const warnings = inventory
        .map(item => ({ ...item, expiry: getExpiryStatus(item.expires_at) }))
        .filter(item => item.expiry && item.expiry.days <= 7)
        .sort((a, b) => a.expiry.days - b.expiry.days);

    if (warnings.length === 0) { expiryWarnings.innerHTML = ''; return; }

    const urgent = warnings.filter(w => w.expiry.days <= 3);
    const soon = warnings.filter(w => w.expiry.days > 3);

    let html = '<div class="expiry-panel">';
    html += `<div class="expiry-panel-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        ${warnings.length} namirnica ističe uskoro
    </div>`;

    function renderGroup(items) {
        items.forEach(item => {
            const icon = CATEGORY_ICONS[item.category] || '📦';
            html += `<div class="expiry-item ${item.expiry.class}">
                <span>${icon} ${escapeHtml(item.name)}</span>
                <span class="expiry-label">${item.expiry.label}</span>
            </div>`;
        });
    }

    renderGroup(urgent);
    if (soon.length > 0) {
        html += `<div class="expiry-item" style="font-size:11px;font-weight:700;color:var(--gray-500);background:var(--gray-100);">
            Za 4-7 dana (${soon.length})
        </div>`;
        renderGroup(soon);
    }

    html += `<button class="expiry-action-btn" id="btn-expiry-cook">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        Iskoristi u receptu
    </button>`;

    html += '</div>';
    expiryWarnings.innerHTML = html;

    const btnCook = document.getElementById('btn-expiry-cook');
    if (btnCook) {
        btnCook.addEventListener('click', () => {
            const items = urgent.length > 0 ? urgent : soon;
            const expiringNames = items.slice(0, 5).map(w => w.name).join(', ');
            recipePreferences.value = `Koristi ove namirnice jer uskoro ističu: ${expiringNames}`;
            navigateTo('recepti');
        });
    }
}

document.getElementById('btn-quick-inventar').addEventListener('click', () => openAddModal('inventar'));
document.getElementById('btn-quick-kupovina').addEventListener('click', () => openAddModal('kupovina'));

if (btnCookSuggestion && cookSuggestionEl) {
    btnCookSuggestion.addEventListener('click', () => {
        const id = cookSuggestionEl.dataset.recipeId;
        if (!id) return;
        if (!cookbookRecipes.find(r => String(r.id) === String(id))) return;
        selectedRecipeId = id;
        navigateTo('kuharica');
        openRecipeDetail(id);
    });
}

if (btnCookShopping && cookSuggestionEl) {
    btnCookShopping.addEventListener('click', async () => {
        const id = cookSuggestionEl.dataset.recipeId;
        if (!id) return;
        const recipe = cookbookRecipes.find(r => String(r.id) === String(id));
        if (!recipe) return;
        btnCookShopping.disabled = true;
        try {
            const { added, skipped } = await addMissingIngredientsToShopping(recipe);
            const parts = [];
            if (added > 0) parts.push(namirniceListaMsg(added));
            if (skipped > 0) parts.push(vecNaListiMsg(skipped));
            if (parts.length) alert(parts.join(' '));
            else alert('Ništa nije dodano — sve je već na listi ili u smočnici.');
        } catch (e) {
            alert(e.message || 'Greška');
        } finally {
            btnCookShopping.disabled = false;
        }
    });
}

// =====================
//   MEAL PLANER
// =====================
function renderPlaner() {
    const end = new Date(planerWeekStart);
    end.setDate(end.getDate() + 6);
    const weekLabel = `${planerWeekStart.getDate()}. - ${end.getDate()}. ${end.toLocaleDateString('hr-HR', { month: 'short' })}`;
    document.getElementById('planer-week-label').textContent = weekLabel;

    const grid = document.getElementById('planer-grid');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(planerWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDateISO(date);
        const isToday = date.getTime() === today.getTime();

        html += `<div class="planer-day ${isToday ? 'planer-today' : ''}">
            <div class="planer-day-header">
                <span class="planer-day-name">${DAY_SHORT[i]}</span>
                <span class="planer-day-date">${date.getDate()}.${date.getMonth() + 1}.</span>
            </div>
            <div class="planer-meals">`;

        for (const meal of MEAL_TYPES) {
            const planned = mealPlan.find(m => {
                const mDate = m.plan_date.includes('T') ? m.plan_date.split('T')[0] : m.plan_date;
                return mDate === dateStr && m.meal_type === meal.id;
            });
            if (planned) {
                const title = planned.recipe_title || planned.custom_title || 'Obrok';
                html += `<div class="planer-meal filled" title="${escapeHtml(title)}">
                    <span class="meal-icon">${meal.icon}</span>
                    <span class="meal-name">${escapeHtml(title)}</span>
                    <button class="meal-remove" data-meal-id="${planned.id}">&times;</button>
                </div>`;
            } else {
                html += `<div class="planer-meal empty" data-date="${dateStr}" data-type="${meal.id}">
                    <span class="meal-icon">${meal.icon}</span>
                    <span class="meal-add">+ ${meal.label}</span>
                </div>`;
            }
        }

        html += '</div></div>';
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.planer-meal.empty').forEach(el => {
        el.addEventListener('click', () => openMealModal(el.dataset.date, el.dataset.type));
    });

    grid.querySelectorAll('.meal-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await api('DELETE', `/meal-plan/${btn.dataset.mealId}`);
                mealPlan = mealPlan.filter(m => m.id != btn.dataset.mealId);
                renderPlaner();
            } catch (err) { alert(err.message); }
        });
    });
}

document.getElementById('planer-prev').addEventListener('click', async () => {
    planerWeekStart.setDate(planerWeekStart.getDate() - 7);
    await loadMealPlan();
    renderPlaner();
});

document.getElementById('planer-next').addEventListener('click', async () => {
    planerWeekStart.setDate(planerWeekStart.getDate() + 7);
    await loadMealPlan();
    renderPlaner();
});

// Meal Modal
const mealFormOverlay = document.getElementById('modal-meal-overlay');
const mealForm = document.getElementById('meal-form');
const mealRecipeSelect = document.getElementById('meal-recipe-select');
const mealCustomTitle = document.getElementById('meal-custom-title');

function openMealModal(dateStr, mealType) {
    const mealLabel = MEAL_TYPES.find(m => m.id === mealType)?.label || mealType;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long' });

    document.getElementById('meal-modal-title').textContent = `Dodaj ${mealLabel.toLowerCase()}`;
    document.getElementById('meal-modal-info').textContent = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    document.getElementById('meal-date').value = dateStr;
    document.getElementById('meal-type').value = mealType;

    mealRecipeSelect.innerHTML = '<option value="">-- Bez recepta --</option>';
    cookbookRecipes.forEach(r => {
        mealRecipeSelect.innerHTML += `<option value="${r.id}">${escapeHtml(r.title)}</option>`;
    });

    mealCustomTitle.value = '';
    mealFormOverlay.classList.add('open');
}

function closeMealModal() { mealFormOverlay.classList.remove('open'); }

document.getElementById('btn-close-meal').addEventListener('click', closeMealModal);
mealFormOverlay.addEventListener('click', (e) => { if (e.target === mealFormOverlay) closeMealModal(); });

mealForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const plan_date = document.getElementById('meal-date').value;
    const meal_type = document.getElementById('meal-type').value;
    const recipe_id = mealRecipeSelect.value || null;
    const custom_title = mealCustomTitle.value.trim() || null;

    if (!recipe_id && !custom_title) {
        alert('Odaberite recept ili unesite naziv obroka.');
        return;
    }

    try {
        const meal = await api('POST', '/meal-plan', { plan_date, meal_type, recipe_id, custom_title });
        mealPlan.push(meal);
        renderPlaner();
        closeMealModal();
    } catch (err) { alert(err.message); }
});

document.getElementById('btn-planer-shopping').addEventListener('click', async () => {
    const recipeIds = mealPlan.filter(m => m.recipe_id).map(m => m.recipe_id);
    if (recipeIds.length === 0) {
        alert('Nema planiranih recepata za ovu sedmicu.');
        return;
    }

    const uniqueIds = [...new Set(recipeIds)];
    const allIngredients = [];

    for (const id of uniqueIds) {
        const recipe = cookbookRecipes.find(r => r.id == id);
        if (!recipe) continue;
        const ings = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
        for (const ing of (ings || [])) {
            if (!allIngredients.find(a => a.name.toLowerCase() === ing.name.toLowerCase())) {
                allIngredients.push(ing);
            }
        }
    }

    const missing = allIngredients.filter(ing => {
        if (findInventoryMatch(ing.name)) return false;
        if (shoppingList.find(s => s.name.toLowerCase() === ing.name.toLowerCase())) return false;
        return true;
    });

    if (missing.length === 0) {
        alert('Imate sve sastojke ili su već na listi!');
        return;
    }

    if (!confirm(`Dodati ${missing.length} namirnica na listu za kupovinu?`)) return;

    let added = 0;
    for (const ing of missing) {
        try {
            await api('POST', '/shopping', { name: ing.name, quantity: 1, unit: 'kom', category: 'Ostalo' });
            added++;
        } catch (e) { console.error(e); }
    }

    await loadData();
    alert(`${added} namirnica dodano na listu za kupovinu!`);
});

// =====================
//   NAV BADGES
// =====================
function updateNavBadges() {
    const kuharicaCount = document.getElementById('kuharica-count');
    const pocetnaExpiry = document.getElementById('pocetna-expiry-count');
    if (inventory.length > 0) {
        inventarCount.textContent = inventory.length;
        inventarCount.style.display = '';
    } else { inventarCount.style.display = 'none'; }
    if (shoppingList.length > 0) {
        kupovinaCount.textContent = shoppingList.length;
        kupovinaCount.style.display = '';
    } else { kupovinaCount.style.display = 'none'; }
    if (cookbookRecipes.length > 0) {
        kuharicaCount.textContent = cookbookRecipes.length;
        kuharicaCount.style.display = '';
    } else { kuharicaCount.style.display = 'none'; }
    const expiringCount = inventory.filter(i => {
        const s = getExpiryStatus(i.expires_at);
        return s && s.days <= 3;
    }).length;
    if (expiringCount > 0) {
        pocetnaExpiry.textContent = expiringCount;
        pocetnaExpiry.style.display = '';
    } else { pocetnaExpiry.style.display = 'none'; }
}

// =====================
//   INVENTAR - CATEGORIES
// =====================
function showCategoriesView() {
    inventarCategoriesView.style.display = '';
    inventarItemsView.style.display = 'none';
    searchInventar.value = '';
    inventarSearchResults.style.display = 'none';
    inventarSearchResults.innerHTML = '';
    categoriesGrid.style.display = '';
    renderCategoriesGrid();
}

function showItemsView(category) {
    selectedCategory = category;
    inventarCategoriesView.style.display = 'none';
    inventarItemsView.style.display = '';
    searchCategoryItems.value = '';

    topBarTitle.textContent = `${CATEGORY_ICONS[category] || '📦'} ${category}`;
    btnBack.style.display = '';

    const items = inventory.filter(i => i.category === category);
    const icon = CATEGORY_ICONS[category] || '📦';
    categoryViewHeader.innerHTML = `
        <span class="category-view-icon">${icon}</span>
        <div class="category-view-info">
            <span class="category-view-name">${escapeHtml(category)}</span>
            <span class="category-view-count">${items.length} namirnica</span>
        </div>
    `;

    renderCategoryItems();
}

function renderCategoriesGrid() {
    const categoryCounts = {};
    inventory.forEach(item => {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });

    const categories = Object.keys(categoryCounts).sort();

    if (inventory.length === 0) {
        categoriesGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 7h-9"/><path d="M14 17H5"/>
                    <circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>
                </svg>
                <p>Inventar je prazan</p>
                <span>Dodajte prvu namirnicu klikom na "Dodaj"</span>
            </div>`;
        return;
    }

    let html = '';

    if (categories.length > 1) {
        html += `<div class="category-card category-card-all" data-cat="__all__">
            <span class="category-card-icon">📋</span>
            <span class="category-card-name">Sve namirnice</span>
            <span class="category-card-count">${inventory.length}</span>
        </div>`;
    }

    categories.forEach(cat => {
        const icon = CATEGORY_ICONS[cat] || '📦';
        html += `<div class="category-card" data-cat="${escapeHtml(cat)}">
            <span class="category-card-icon">${icon}</span>
            <span class="category-card-name">${escapeHtml(cat)}</span>
            <span class="category-card-count">${categoryCounts[cat]}</span>
        </div>`;
    });

    categoriesGrid.innerHTML = html;

    categoriesGrid.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            const cat = card.dataset.cat;
            if (cat === '__all__') {
                showItemsView('__all__');
            } else {
                showItemsView(cat);
            }
        });
    });
}

// Handle "All" as a special case
function renderCategoryItems() {
    const search = searchCategoryItems.value.toLowerCase().trim();
    let items;

    if (selectedCategory === '__all__') {
        items = inventory.slice();
        topBarTitle.textContent = '📋 Sve namirnice';
        categoryViewHeader.innerHTML = `
            <span class="category-view-icon">📋</span>
            <div class="category-view-info">
                <span class="category-view-name">Sve namirnice</span>
                <span class="category-view-count">${inventory.length} namirnica</span>
            </div>
        `;
    } else {
        items = inventory.filter(i => i.category === selectedCategory);
    }

    if (search) {
        items = items.filter(i => i.name.toLowerCase().includes(search));
    }

    if (items.length === 0) {
        inventarList.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'Nema rezultata' : 'Nema namirnica'}</p>
                <span>${search ? 'Pokušajte drugi pojam' : 'Dodajte namirnicu klikom na "Dodaj"'}</span>
            </div>`;
        return;
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    let html = '';
    items.forEach(item => { html += renderInventoryCard(item); });
    inventarList.innerHTML = html;
    bindInventoryActions();
}

// Global search on categories page
searchInventar.addEventListener('input', () => {
    const search = searchInventar.value.toLowerCase().trim();
    if (search) {
        categoriesGrid.style.display = 'none';
        const items = inventory.filter(i => i.name.toLowerCase().includes(search));
        if (items.length === 0) {
            inventarSearchResults.innerHTML = `
                <div class="empty-state">
                    <p>Nema rezultata</p>
                    <span>Pokušajte drugi pojam za pretragu</span>
                </div>`;
        } else {
            items.sort((a, b) => a.name.localeCompare(b.name));
            let html = '';
            items.forEach(item => { html += renderInventoryCard(item); });
            inventarSearchResults.innerHTML = html;
            bindSearchResultActions();
        }
        inventarSearchResults.style.display = '';
    } else {
        categoriesGrid.style.display = '';
        inventarSearchResults.style.display = 'none';
        inventarSearchResults.innerHTML = '';
    }
});

searchCategoryItems.addEventListener('input', renderCategoryItems);

function bindSearchResultActions() {
    inventarSearchResults.querySelectorAll('.btn-icon.consume').forEach(btn => {
        btn.addEventListener('click', () => openConsumeModal(btn.dataset.id));
    });
    inventarSearchResults.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id, 'inventar'));
    });
    inventarSearchResults.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Obrisati ovu namirnicu iz smočnice?')) return;
            try {
                await api('DELETE', `/inventory/${btn.dataset.id}`);
                inventory = inventory.filter(i => i.id != btn.dataset.id);
                renderAll();
                searchInventar.dispatchEvent(new Event('input'));
            } catch (err) { alert(err.message); }
        });
    });
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
            if (!confirm('Obrisati ovu namirnicu iz smočnice?')) return;
            try {
                await api('DELETE', `/inventory/${btn.dataset.id}`);
                inventory = inventory.filter(i => i.id != btn.dataset.id);
                renderAll();
                if (selectedCategory) renderCategoryItems();
            } catch (err) { alert(err.message); }
        });
    });
}

// =====================
//   SHOPPING LIST
// =====================
function renderShoppingList() {
    const search = searchKupovina.value.toLowerCase().trim();
    let items = shoppingList.slice();
    if (search) items = items.filter(item => item.name.toLowerCase().includes(search));

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
                updateNavBadges();
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
                renderAll();
            } catch (err) { alert(err.message); }
        });
    });
}

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
        renderAll();
    } catch (err) { alert(err.message); }
});

searchKupovina.addEventListener('input', renderShoppingList);

// =====================
//   MODAL: Add / Edit
// =====================
function openAddModal(target) {
    modalTitle.textContent = target === 'inventar' ? 'Dodaj u smočnicu' : 'Dodaj na listu';
    formBtnText.textContent = 'Dodaj';
    itemForm.reset();
    itemId.value = '';
    itemTarget.value = target;
    itemExpires.value = '';
    expiryGroup.style.display = target === 'inventar' ? '' : 'none';
    inventoryNotice.style.display = 'none';

    if (target === 'inventar' && selectedCategory && selectedCategory !== '__all__') {
        itemCategory.value = selectedCategory;
    }

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
document.getElementById('btn-add-category-item').addEventListener('click', () => openAddModal('inventar'));
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
        if (selectedCategory) renderCategoryItems();
        closeModal();
    } catch (err) { alert(err.message); }
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
        inventoryNotice.textContent = `Već imate: ${formatQty(match.quantity)} ${match.unit} u smočnici`;
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

function closeConsumeModal() { consumeOverlay.classList.remove('open'); }

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
        if (selectedCategory) renderCategoryItems();
        closeConsumeModal();
    } catch (err) { alert(err.message); }
});

document.getElementById('btn-remove-all').addEventListener('click', async () => {
    const id = consumeId.value;
    try {
        await api('DELETE', `/inventory/${id}`);
        await loadData();
        if (selectedCategory) renderCategoryItems();
        closeConsumeModal();
    } catch (err) { alert(err.message); }
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeConsumeModal(); closeRecipeFormModal(); closeMealModal(); }
});

// =====================
//   COOKBOOK (KUHARICA)
// =====================
const cookbookList = document.getElementById('cookbook-list');
const kuharicaListView = document.getElementById('kuharica-list-view');
const kuharicaDetailView = document.getElementById('kuharica-detail-view');
const recipeDetailCard = document.getElementById('recipe-detail-card');
const searchKuharica = document.getElementById('search-kuharica');

function showCookbookListView() {
    kuharicaListView.style.display = '';
    kuharicaDetailView.style.display = 'none';
    renderCookbookList();
}

function renderCookbookList() {
    const search = searchKuharica.value.toLowerCase().trim();
    let recipes = cookbookRecipes.slice();
    if (search) recipes = recipes.filter(r => r.title.toLowerCase().includes(search));

    if (recipes.length === 0) {
        cookbookList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                </svg>
                <p>${search ? 'Nema rezultata' : 'Kuharica je prazna'}</p>
                <span>${search ? 'Pokušajte drugi pojam' : 'Dodajte recept ručno ili spremite AI recept'}</span>
            </div>`;
        return;
    }

    cookbookList.innerHTML = recipes.map(r => {
        const ings = (typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients) || [];
        const preview = ings.slice(0, 3).map(i => i.name).join(', ');
        return `<div class="cookbook-card" data-id="${r.id}">
            <div class="cookbook-card-title">${escapeHtml(r.title)}</div>
            <div class="cookbook-card-meta">
                ${r.prep_time ? `<span>⏱ ${escapeHtml(r.prep_time)}</span>` : ''}
                ${r.difficulty ? `<span>📊 ${escapeHtml(r.difficulty)}</span>` : ''}
                ${r.servings ? `<span>👤 ${escapeHtml(r.servings)}</span>` : ''}
            </div>
            <span class="cookbook-card-cat">${escapeHtml(r.category || 'Ostalo')}</span>
            ${preview ? `<div class="cookbook-card-preview">Sastojci: ${escapeHtml(preview)}${ings.length > 3 ? '...' : ''}</div>` : ''}
        </div>`;
    }).join('');

    cookbookList.querySelectorAll('.cookbook-card').forEach(card => {
        card.addEventListener('click', () => openRecipeDetail(card.dataset.id));
    });
}

searchKuharica.addEventListener('input', renderCookbookList);

function openRecipeDetail(id) {
    selectedRecipeId = id;
    const r = cookbookRecipes.find(r => r.id == id);
    if (!r) return;

    kuharicaListView.style.display = 'none';
    kuharicaDetailView.style.display = '';
    topBarTitle.textContent = r.title;
    btnBack.style.display = '';

    const ingredients = recipeIngredientsArray(r);
    let steps;
    try {
        steps = typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps;
    } catch {
        steps = [];
    }
    if (!Array.isArray(steps)) steps = [];

    const ingredientsList = ingredients.map(ing => {
        const invMatch = findInventoryMatch(ing.name);
        let status;
        if (invMatch) {
            status = `<span class="ing-status ing-have">✓ Imate: ${formatQty(invMatch.quantity)} ${invMatch.unit}</span>`;
        } else {
            status = `<span class="ing-status ing-miss">✗ Nedostaje</span>`;
        }
        return `<li>${escapeHtml(ing.amount || '')} ${escapeHtml(ing.name)} ${status}</li>`;
    }).join('');

    const stepsList = steps.map((step, i) =>
        `<li><span class="step-num">${i + 1}</span><span>${escapeHtml(step)}</span></li>`
    ).join('');

    const tip = r.tip ? `<div class="recipe-tip"><strong>Savjet:</strong> ${escapeHtml(r.tip)}</div>` : '';

    recipeDetailCard.innerHTML = `
        <div class="recipe-header">
            <h3>${escapeHtml(r.title)}</h3>
            <div class="recipe-meta">
                ${r.prep_time ? `<span class="recipe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(r.prep_time)}</span>` : ''}
                ${r.difficulty ? `<span class="recipe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>${escapeHtml(r.difficulty)}</span>` : ''}
                ${r.servings ? `<span class="recipe-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${escapeHtml(r.servings)}</span>` : ''}
            </div>
        </div>
        <div class="recipe-section">
            <h4>Sastojci</h4>
            <ul class="recipe-ingredients">${ingredientsList}</ul>
        </div>
        <div class="recipe-section">
            <h4>Priprema</h4>
            <ol class="recipe-steps">${stepsList}</ol>
        </div>
        ${tip}
    `;

    const missingCount = ingredients.filter(ing => !findInventoryMatch(ing.name)).length;
    document.getElementById('btn-add-missing').style.display = missingCount > 0 ? '' : 'none';

    contentEl.scrollTop = 0;
}

document.getElementById('btn-add-missing').addEventListener('click', async () => {
    const r = cookbookRecipes.find(r => r.id == selectedRecipeId);
    if (!r) return;
    const missing = recipeIngredientsArray(r).filter(ing => !findInventoryMatch(ing.name));
    if (missing.length === 0) { alert('Imate sve sastojke!'); return; }

    const { added, skipped } = await addMissingIngredientsToShopping(r);
    let msg = '';
    if (added > 0) msg = `${added} namirnica dodano na listu za kupovinu!`;
    if (skipped > 0) msg += (msg ? ' ' : '') + `(${skipped} već na listi)`;
    alert(msg || 'Ništa nije dodano.');
});

document.getElementById('btn-edit-recipe').addEventListener('click', () => {
    const r = cookbookRecipes.find(r => r.id == selectedRecipeId);
    if (r) openRecipeFormModal(r);
});

document.getElementById('btn-delete-recipe').addEventListener('click', async () => {
    if (!confirm('Obrisati ovaj recept iz kuharice?')) return;
    try {
        await api('DELETE', `/cookbook/${selectedRecipeId}`);
        cookbookRecipes = cookbookRecipes.filter(r => r.id != selectedRecipeId);
        selectedRecipeId = null;
        showCookbookListView();
        topBarTitle.textContent = PAGE_TITLES.kuharica;
        btnBack.style.display = 'none';
        updateNavBadges();
    } catch (err) { alert(err.message); }
});

// ---- Recipe Form Modal ----
const recipeFormOverlay = document.getElementById('modal-recipe-overlay');
const recipeFormEl = document.getElementById('recipe-form');
const ingredientsRows = document.getElementById('ingredients-rows');
const stepsRows = document.getElementById('steps-rows');

document.getElementById('btn-add-recipe').addEventListener('click', () => openRecipeFormModal());
document.getElementById('btn-close-recipe-modal').addEventListener('click', closeRecipeFormModal);
recipeFormOverlay.addEventListener('click', (e) => { if (e.target === recipeFormOverlay) closeRecipeFormModal(); });

function addIngredientRow(amount = '', name = '') {
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.innerHTML = `
        <input type="text" class="row-amount" placeholder="Količina" value="${escapeHtml(amount)}">
        <input type="text" placeholder="Naziv sastojka" value="${escapeHtml(name)}">
        <button type="button" class="btn-remove-row">&times;</button>
    `;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    ingredientsRows.appendChild(div);
}

function addStepRow(text = '') {
    const div = document.createElement('div');
    div.className = 'dynamic-row';
    div.innerHTML = `
        <input type="text" placeholder="Opišite korak..." value="${escapeHtml(text)}">
        <button type="button" class="btn-remove-row">&times;</button>
    `;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    stepsRows.appendChild(div);
}

document.getElementById('btn-add-ingredient').addEventListener('click', () => addIngredientRow());
document.getElementById('btn-add-step').addEventListener('click', () => addStepRow());

function openRecipeFormModal(recipe = null) {
    document.getElementById('recipe-modal-title').textContent = recipe ? 'Uredi recept' : 'Novi recept';
    document.getElementById('recipe-form-btn-text').textContent = recipe ? 'Spremi izmjene' : 'Spremi recept';
    document.getElementById('recipe-edit-id').value = recipe ? recipe.id : '';

    if (recipe) {
        document.getElementById('recipe-title').value = recipe.title || '';
        document.getElementById('recipe-cat').value = recipe.category || 'Ostalo';
        document.getElementById('recipe-diff').value = recipe.difficulty || 'Srednje';
        document.getElementById('recipe-time').value = recipe.prep_time || '';
        document.getElementById('recipe-servings').value = recipe.servings || '';
        document.getElementById('recipe-tip-input').value = recipe.tip || '';

        const ings = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients;
        const stps = typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : recipe.steps;

        ingredientsRows.innerHTML = '';
        (ings || []).forEach(ing => addIngredientRow(ing.amount || '', ing.name || ''));

        stepsRows.innerHTML = '';
        (stps || []).forEach(step => addStepRow(step));
    } else {
        recipeFormEl.reset();
        ingredientsRows.innerHTML = '';
        stepsRows.innerHTML = '';
        addIngredientRow();
        addIngredientRow();
        addStepRow();
        addStepRow();
    }

    recipeFormOverlay.classList.add('open');
    setTimeout(() => document.getElementById('recipe-title').focus(), 200);
}

function closeRecipeFormModal() { recipeFormOverlay.classList.remove('open'); }

recipeFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('recipe-edit-id').value;
    const title = document.getElementById('recipe-title').value.trim();
    const category = document.getElementById('recipe-cat').value;
    const difficulty = document.getElementById('recipe-diff').value;
    const prep_time = document.getElementById('recipe-time').value.trim();
    const servings = document.getElementById('recipe-servings').value.trim();
    const tip = document.getElementById('recipe-tip-input').value.trim();

    const ingredients = [];
    ingredientsRows.querySelectorAll('.dynamic-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const amount = inputs[0].value.trim();
        const name = inputs[1].value.trim();
        if (name) ingredients.push({ amount, name });
    });

    const steps = [];
    stepsRows.querySelectorAll('.dynamic-row').forEach(row => {
        const val = row.querySelector('input').value.trim();
        if (val) steps.push(val);
    });

    if (!title) { alert('Unesite naziv jela'); return; }
    if (ingredients.length === 0) { alert('Dodajte barem jedan sastojak'); return; }
    if (steps.length === 0) { alert('Dodajte barem jedan korak'); return; }

    try {
        const body = { title, category, difficulty, prep_time, servings, ingredients, steps, tip };
        if (id) {
            await api('PUT', `/cookbook/${id}`, body);
        } else {
            await api('POST', '/cookbook', body);
        }
        await loadData();
        closeRecipeFormModal();
        if (id && selectedRecipeId == id) openRecipeDetail(id);
    } catch (err) { alert(err.message); }
});

// =====================
//   RECIPE GENERATION
// =====================
const btnGenerate = document.getElementById('btn-generate-recipe');
const btnAnother = document.getElementById('btn-another-recipe');
const recipePreferences = document.getElementById('recipe-preferences');
const recipeLoading = document.getElementById('recipe-loading');
const recipeResult = document.getElementById('recipe-result');

btnGenerate.addEventListener('click', generateRecipe);
btnAnother.addEventListener('click', generateRecipe);

document.getElementById('btn-save-ai-recipe').addEventListener('click', async () => {
    if (!lastAiRecipe) return;
    try {
        await api('POST', '/cookbook', {
            title: lastAiRecipe.title,
            category: 'Ostalo',
            prep_time: lastAiRecipe.time,
            difficulty: lastAiRecipe.difficulty,
            servings: lastAiRecipe.servings,
            ingredients: lastAiRecipe.ingredients.map(i => ({ name: i.name, amount: i.amount })),
            steps: lastAiRecipe.steps,
            tip: lastAiRecipe.tip || ''
        });
        await loadData();
        alert('Recept spremljen u kuharicu!');
    } catch (err) { alert(err.message); }
});

async function generateRecipe() {
    const preferences = recipePreferences.value.trim();
    recipeLoading.style.display = 'flex';
    recipeResult.style.display = 'none';
    document.getElementById('ai-recipe-actions').style.display = 'none';
    btnGenerate.disabled = true;

    try {
        const recipe = await api('POST', '/recipes/generate', { preferences });
        lastAiRecipe = recipe;
        renderRecipe(recipe);
    } catch (err) {
        recipeResult.innerHTML = `<div class="recipe-error">${escapeHtml(err.message)}</div>`;
        recipeResult.style.display = 'block';
    } finally {
        recipeLoading.style.display = 'none';
        btnGenerate.disabled = false;
    }
}

function renderRecipe(recipe) {
    const ingredientsList = recipe.ingredients.map(ing => {
        const fromInv = ing.from_inventory
            ? '<span class="ing-tag ing-have">iz smočnice</span>'
            : '<span class="ing-tag ing-extra">dodatno</span>';
        return `<li>${escapeHtml(ing.amount)} ${escapeHtml(ing.name)} ${fromInv}</li>`;
    }).join('');

    const stepsList = recipe.steps.map((step, i) => {
        return `<li><span class="step-num">${i + 1}</span><span>${escapeHtml(step)}</span></li>`;
    }).join('');

    const tip = recipe.tip ? `<div class="recipe-tip"><strong>Savjet:</strong> ${escapeHtml(recipe.tip)}</div>` : '';

    recipeResult.innerHTML = `
        <div class="recipe-header">
            <h3>${escapeHtml(recipe.title)}</h3>
            <div class="recipe-meta">
                <span class="recipe-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${escapeHtml(recipe.time)}
                </span>
                <span class="recipe-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
                    ${escapeHtml(recipe.difficulty)}
                </span>
                <span class="recipe-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    ${escapeHtml(recipe.servings)}
                </span>
            </div>
        </div>
        <div class="recipe-section">
            <h4>Sastojci</h4>
            <ul class="recipe-ingredients">${ingredientsList}</ul>
        </div>
        <div class="recipe-section">
            <h4>Priprema</h4>
            <ol class="recipe-steps">${stepsList}</ol>
        </div>
        ${tip}
    `;
    recipeResult.style.display = 'block';
    document.getElementById('ai-recipe-actions').style.display = '';
}

// =====================
//   DARK MODE
// =====================
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

// =====================
//   PWA
// =====================
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
    if (!localStorage.getItem('kuca_install_dismissed')) {
        installBanner.style.display = 'flex';
    }
});

btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBanner.style.display = 'none';
        deferredPrompt = null;
    } else {
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
});

btnDismiss.addEventListener('click', () => {
    installBanner.style.display = 'none';
    localStorage.setItem('kuca_install_dismissed', 'true');
});

window.addEventListener('appinstalled', () => {
    installBanner.style.display = 'none';
    deferredPrompt = null;
});

// ---- Init ----
checkAuth();
