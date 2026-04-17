require('dotenv').config()
const pool = require('./db')

async function setup() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                gender TEXT,
                gender_probability NUMERIC,
                sample_size INTEGER,
                age INTEGER,
                age_group TEXT,
                country_id TEXT,
                country_probability NUMERIC,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `)
        console.log('Table created successfully')
        process.exit(0)
    } catch (err) {
        console.error('Error creating table:', err)
        process.exit(1)
    }
}

setup()