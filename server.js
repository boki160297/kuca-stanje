require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kuca-stanje-tajni-kljuc-promijeni-me';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth Middleware ----
function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Niste prijavljeni' });
    }
    try {
        const token = header.split(' ')[1];
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch {
        return res.status(401).json({ error: 'Nevažeći token, prijavite se ponovo' });
    }
}

// =====================
//   AUTH ROUTES
// =====================

app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Sva polja su obavezna' });
    }
    if (username.length < 3) {
        return res.status(400).json({ error: 'Korisničko ime mora imati min. 3 znaka' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Lozinka mora imati min. 6 znakova' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
        return res.status(400).json({ error: 'Korisničko ime ili email već postoji' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);

    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
        token,
        user: { id: result.lastInsertRowid, username, email }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
        return res.status(400).json({ error: 'Unesite korisničko ime/email i lozinku' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email }
    });
});

app.get('/api/auth/me', authRequired, (req, res) => {
    const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'Korisnik ne postoji' });
    res.json({ user });
});

// =====================
//   INVENTORY ROUTES
// =====================

app.get('/api/inventory', authRequired, (req, res) => {
    const items = db.prepare(
        'SELECT * FROM inventory WHERE user_id = ? ORDER BY category, name'
    ).all(req.userId);
    res.json(items);
});

app.post('/api/inventory', authRequired, (req, res) => {
    const { name, quantity, unit, category } = req.body;
    if (!name || !quantity || !unit) {
        return res.status(400).json({ error: 'Naziv, količina i jedinica su obavezni' });
    }

    const existing = db.prepare(
        'SELECT * FROM inventory WHERE user_id = ? AND LOWER(name) = LOWER(?) AND unit = ?'
    ).get(req.userId, name, unit);

    if (existing) {
        db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantity, existing.id);
        const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(existing.id);
        return res.json(updated);
    }

    const result = db.prepare(
        'INSERT INTO inventory (user_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?)'
    ).run(req.userId, name, quantity, unit, category || 'Ostalo');

    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
});

app.put('/api/inventory/:id', authRequired, (req, res) => {
    const { name, quantity, unit, category } = req.body;
    const item = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    db.prepare(
        'UPDATE inventory SET name = ?, quantity = ?, unit = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name || item.name, quantity || item.quantity, unit || item.unit, category || item.category, item.id);

    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(item.id);
    res.json(updated);
});

app.patch('/api/inventory/:id/consume', authRequired, (req, res) => {
    const { amount } = req.body;
    const item = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    const newQty = item.quantity - amount;
    if (newQty <= 0) {
        db.prepare('DELETE FROM inventory WHERE id = ?').run(item.id);
        return res.json({ deleted: true });
    }

    db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, item.id);
    const updated = db.prepare('SELECT * FROM inventory WHERE id = ?').get(item.id);
    res.json(updated);
});

app.delete('/api/inventory/:id', authRequired, (req, res) => {
    const item = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    db.prepare('DELETE FROM inventory WHERE id = ?').run(item.id);
    res.json({ deleted: true });
});

// =====================
//   SHOPPING LIST ROUTES
// =====================

app.get('/api/shopping', authRequired, (req, res) => {
    const items = db.prepare(
        'SELECT * FROM shopping_list WHERE user_id = ? ORDER BY checked, created_at DESC'
    ).all(req.userId);
    res.json(items);
});

app.post('/api/shopping', authRequired, (req, res) => {
    const { name, quantity, unit, category } = req.body;
    if (!name || !quantity || !unit) {
        return res.status(400).json({ error: 'Naziv, količina i jedinica su obavezni' });
    }

    const result = db.prepare(
        'INSERT INTO shopping_list (user_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?)'
    ).run(req.userId, name, quantity, unit, category || 'Ostalo');

    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
});

app.put('/api/shopping/:id', authRequired, (req, res) => {
    const { name, quantity, unit, category } = req.body;
    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    db.prepare(
        'UPDATE shopping_list SET name = ?, quantity = ?, unit = ?, category = ? WHERE id = ?'
    ).run(name || item.name, quantity || item.quantity, unit || item.unit, category || item.category, item.id);

    const updated = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(item.id);
    res.json(updated);
});

app.patch('/api/shopping/:id/toggle', authRequired, (req, res) => {
    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    db.prepare('UPDATE shopping_list SET checked = ? WHERE id = ?').run(item.checked ? 0 : 1, item.id);
    const updated = db.prepare('SELECT * FROM shopping_list WHERE id = ?').get(item.id);
    res.json(updated);
});

app.delete('/api/shopping/:id', authRequired, (req, res) => {
    const item = db.prepare('SELECT * FROM shopping_list WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!item) return res.status(404).json({ error: 'Stavka nije pronađena' });

    db.prepare('DELETE FROM shopping_list WHERE id = ?').run(item.id);
    res.json({ deleted: true });
});

app.post('/api/shopping/buy-checked', authRequired, (req, res) => {
    const checked = db.prepare(
        'SELECT * FROM shopping_list WHERE user_id = ? AND checked = 1'
    ).all(req.userId);

    if (checked.length === 0) {
        return res.status(400).json({ error: 'Nema označenih namirnica' });
    }

    const addToInventory = db.transaction(() => {
        for (const item of checked) {
            const existing = db.prepare(
                'SELECT * FROM inventory WHERE user_id = ? AND LOWER(name) = LOWER(?) AND unit = ?'
            ).get(req.userId, item.name, item.unit);

            if (existing) {
                db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(item.quantity, existing.id);
            } else {
                db.prepare('INSERT INTO inventory (user_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?)')
                    .run(req.userId, item.name, item.quantity, item.unit, item.category);
            }
        }
        db.prepare('DELETE FROM shopping_list WHERE user_id = ? AND checked = 1').run(req.userId);
    });

    addToInventory();
    res.json({ moved: checked.length });
});

app.delete('/api/shopping/checked', authRequired, (req, res) => {
    const result = db.prepare('DELETE FROM shopping_list WHERE user_id = ? AND checked = 1').run(req.userId);
    res.json({ deleted: result.changes });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Kućne Zalihe server pokrenut na http://localhost:${PORT}`);
});
