if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const pool = require('./db')

async function migrate() {
    try {
        await pool.query(`
            ALTER TABLE profiles 
            ADD COLUMN IF NOT EXISTS country_name VARCHAR
        `)
        console.log('Added country_name column')

        try {
            await pool.query(`
                ALTER TABLE profiles 
                ADD CONSTRAINT profiles_name_unique UNIQUE (name)
            `)
            console.log('Added unique constraint on name')
        } catch (err) {
            if (err.message.includes('already exists')) {
                console.log('Unique constraint already exists, skipping')
            } else {
                throw err
            }
        }

        console.log('Migration complete')
        process.exit(0)
    } catch (err) {
        console.error('Migration failed:', err.message)
        process.exit(1)
    }
}

migrate()