require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pool, initDB } = require('./database');

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

app.post('/api/auth/register', async (req, res) => {
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

    try {
        const existing = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Korisničko ime ili email već postoji' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hash]
        );

        const userId = result.rows[0].id;
        const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ token, user: { id: userId, username, email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
        return res.status(400).json({ error: 'Unesite korisničko ime/email i lozinku' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $1', [login]
        );
        const user = result.rows[0];

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, created_at FROM users WHERE id = $1', [req.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Korisnik ne postoji' });
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

// =====================
//   INVENTORY ROUTES
// =====================

app.get('/api/inventory', authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM inventory WHERE user_id = $1 ORDER BY category, name', [req.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.post('/api/inventory', authRequired, async (req, res) => {
    const { name, quantity, unit, category, expires_at } = req.body;
    if (!name || !quantity || !unit) {
        return res.status(400).json({ error: 'Naziv, količina i jedinica su obavezni' });
    }

    try {
        const existing = await pool.query(
            'SELECT * FROM inventory WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND unit = $3',
            [req.userId, name, unit]
        );

        if (existing.rows.length > 0) {
            const item = existing.rows[0];
            const newExpiry = expires_at || item.expires_at;
            const updated = await pool.query(
                'UPDATE inventory SET quantity = quantity + $1, expires_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
                [quantity, newExpiry, item.id]
            );
            return res.json(updated.rows[0]);
        }

        const result = await pool.query(
            'INSERT INTO inventory (user_id, name, quantity, unit, category, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.userId, name, quantity, unit, category || 'Ostalo', expires_at || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.put('/api/inventory/:id', authRequired, async (req, res) => {
    const { name, quantity, unit, category, expires_at } = req.body;
    try {
        const check = await pool.query(
            'SELECT * FROM inventory WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        const item = check.rows[0];
        const result = await pool.query(
            'UPDATE inventory SET name = $1, quantity = $2, unit = $3, category = $4, expires_at = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
            [name || item.name, quantity || item.quantity, unit || item.unit, category || item.category, expires_at !== undefined ? expires_at : item.expires_at, item.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.patch('/api/inventory/:id/consume', authRequired, async (req, res) => {
    const { amount } = req.body;
    try {
        const check = await pool.query(
            'SELECT * FROM inventory WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        const item = check.rows[0];
        const newQty = item.quantity - amount;

        if (newQty <= 0) {
            await pool.query('DELETE FROM inventory WHERE id = $1', [item.id]);
            return res.json({ deleted: true });
        }

        const result = await pool.query(
            'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [newQty, item.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.delete('/api/inventory/:id', authRequired, async (req, res) => {
    try {
        const check = await pool.query(
            'SELECT * FROM inventory WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        await pool.query('DELETE FROM inventory WHERE id = $1', [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

// =====================
//   SHOPPING LIST ROUTES
// =====================

app.get('/api/shopping', authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM shopping_list WHERE user_id = $1 ORDER BY checked, created_at DESC',
            [req.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.post('/api/shopping', authRequired, async (req, res) => {
    const { name, quantity, unit, category } = req.body;
    if (!name || !quantity || !unit) {
        return res.status(400).json({ error: 'Naziv, količina i jedinica su obavezni' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO shopping_list (user_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.userId, name, quantity, unit, category || 'Ostalo']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.put('/api/shopping/:id', authRequired, async (req, res) => {
    const { name, quantity, unit, category } = req.body;
    try {
        const check = await pool.query(
            'SELECT * FROM shopping_list WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        const item = check.rows[0];
        const result = await pool.query(
            'UPDATE shopping_list SET name = $1, quantity = $2, unit = $3, category = $4 WHERE id = $5 RETURNING *',
            [name || item.name, quantity || item.quantity, unit || item.unit, category || item.category, item.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.patch('/api/shopping/:id/toggle', authRequired, async (req, res) => {
    try {
        const check = await pool.query(
            'SELECT * FROM shopping_list WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        const result = await pool.query(
            'UPDATE shopping_list SET checked = NOT checked WHERE id = $1 RETURNING *', [req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.delete('/api/shopping/:id', authRequired, async (req, res) => {
    try {
        const check = await pool.query(
            'SELECT * FROM shopping_list WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: 'Stavka nije pronađena' });

        await pool.query('DELETE FROM shopping_list WHERE id = $1', [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

app.post('/api/shopping/buy-checked', authRequired, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const checked = await client.query(
            'SELECT * FROM shopping_list WHERE user_id = $1 AND checked = TRUE', [req.userId]
        );

        if (checked.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Nema označenih namirnica' });
        }

        for (const item of checked.rows) {
            const existing = await client.query(
                'SELECT * FROM inventory WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND unit = $3',
                [req.userId, item.name, item.unit]
            );

            if (existing.rows.length > 0) {
                await client.query(
                    'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
                    [item.quantity, existing.rows[0].id]
                );
            } else {
                await client.query(
                    'INSERT INTO inventory (user_id, name, quantity, unit, category) VALUES ($1, $2, $3, $4, $5)',
                    [req.userId, item.name, item.quantity, item.unit, item.category]
                );
            }
        }

        await client.query('DELETE FROM shopping_list WHERE user_id = $1 AND checked = TRUE', [req.userId]);
        await client.query('COMMIT');
        res.json({ moved: checked.rows.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    } finally {
        client.release();
    }
});

app.delete('/api/shopping/checked', authRequired, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM shopping_list WHERE user_id = $1 AND checked = TRUE', [req.userId]
        );
        res.json({ deleted: result.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Greška na serveru' });
    }
});

// =====================
//   RECIPE GENERATION
// =====================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/recipes/generate', authRequired, async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'AI nije konfiguriran' });
    }

    const { preferences } = req.body;

    try {
        const invResult = await pool.query(
            'SELECT name, quantity, unit, category FROM inventory WHERE user_id = $1 ORDER BY category, name',
            [req.userId]
        );

        if (invResult.rows.length === 0) {
            return res.status(400).json({ error: 'Inventar je prazan — dodajte namirnice prvo' });
        }

        const itemsList = invResult.rows
            .map(i => `- ${i.name}: ${i.quantity} ${i.unit}`)
            .join('\n');

        let prefText = '';
        if (preferences) prefText = `\nDodatni zahtjevi: ${preferences}`;

        const prompt = `Ti si kuhar koji pomaže ljudima kuhati od namirnica koje imaju kod kuće.

Korisnik ima ove namirnice:
${itemsList}
${prefText}

Predloži jedan recept koji se može napraviti od dostupnih namirnica. Ako nedostaje neka sitnica (sol, papar, ulje), pretpostavi da to imaju.

Odgovori ISKLJUČIVO u ovom JSON formatu (bez markdown oznaka):
{
  "title": "Naziv jela",
  "time": "Vrijeme pripreme (npr. 30 min)",
  "difficulty": "Lagano/Srednje/Teže",
  "servings": "Za koliko osoba",
  "ingredients": [
    {"name": "Naziv namirnice", "amount": "Količina", "from_inventory": true}
  ],
  "steps": [
    "Korak 1...",
    "Korak 2..."
  ],
  "tip": "Savjet kuhara (opcionalno)"
}

Polje from_inventory je true ako namirnica postoji u inventaru, false ako je dodatna (sol, papar, ulje itd).
Piši na bosanskom/hrvatskom jeziku.`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 2048
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const errData = await geminiRes.json();
            console.error('Gemini error:', errData);
            return res.status(500).json({ error: 'Greška pri generiranju recepta' });
        }

        const geminiData = await geminiRes.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({ error: 'AI nije vratio odgovor' });
        }

        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const recipe = JSON.parse(cleaned);

        res.json(recipe);
    } catch (err) {
        console.error('Recipe generation error:', err);
        res.status(500).json({ error: 'Greška pri generiranju recepta. Pokušajte ponovo.' });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Start ----
initDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Kućne Zalihe server pokrenut na http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Greška pri pokretanju baze:', err);
        process.exit(1);
    });
