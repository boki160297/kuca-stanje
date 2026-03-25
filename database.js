const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Ostalo',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS shopping_list (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Ostalo',
            checked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS cookbook (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL DEFAULT 'Ostalo',
            prep_time TEXT,
            difficulty TEXT,
            servings TEXT,
            ingredients JSONB NOT NULL,
            steps JSONB NOT NULL,
            tip TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS meal_plan (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_date DATE NOT NULL,
            meal_type TEXT NOT NULL,
            recipe_id INTEGER REFERENCES cookbook(id) ON DELETE SET NULL,
            custom_title TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
        CREATE INDEX IF NOT EXISTS idx_shopping_user ON shopping_list(user_id);
        CREATE INDEX IF NOT EXISTS idx_cookbook_user ON cookbook(user_id);
        CREATE INDEX IF NOT EXISTS idx_meal_plan_user ON meal_plan(user_id, plan_date);
    `);

    // Migration: add expires_at column if missing
    await pool.query(`
        ALTER TABLE inventory ADD COLUMN IF NOT EXISTS expires_at DATE;
    `);
}

module.exports = { pool, initDB };
