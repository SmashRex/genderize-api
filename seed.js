if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const pool = require('./db')
const fs = require('fs')

function uuidv7() {
    const now = Date.now()
    const time = BigInt(now)
    const timeHigh = Number((time >> 12n) & 0xFFFFFFFFn)
    const timeLow = Number(time & 0xFFFn)
    const rand = new Uint8Array(10)
    crypto.getRandomValues(rand)
    const hex = [
        timeHigh.toString(16).padStart(8, '0'),
        timeLow.toString(16).padStart(4, '0'),
        '7' + (rand[0] & 0x0f).toString(16).padStart(3, '0'),
        ((rand[1] & 0x3f) | 0x80).toString(16).padStart(2, '0') + Array.from(rand.slice(2, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
    ].join('-')
    return hex
}

async function seed() {
    try {
        const raw = fs.readFileSync('./seed_profiles.json', 'utf8')
        const { profiles } = JSON.parse(raw)

        const BATCH_SIZE = 50
        let inserted = 0
        let skipped = 0

        for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
            const batch = profiles.slice(i, i + BATCH_SIZE)

            for (const profile of batch) {
                try {
                    const result = await pool.query(
                        `INSERT INTO profiles 
                        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                        ON CONFLICT (name) DO NOTHING`,
                        [
                            uuidv7(),
                            profile.name,
                            profile.gender,
                            profile.gender_probability,
                            null,
                            profile.age,
                            profile.age_group,
                            profile.country_id,
                            profile.country_name,
                            profile.country_probability
                        ]
                    )
                    if (result.rowCount > 0) inserted++
                    else skipped++
                } catch (err) {
                    console.error(`Failed on ${profile.name}:`, err.message)
                    skipped++
                }
            }

            console.log(`Progress: ${Math.min(i + BATCH_SIZE, profiles.length)}/${profiles.length}`)
            // small pause between batches to avoid overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 200))
        }

        console.log(`Seeding complete: ${inserted} inserted, ${skipped} skipped`)
        process.exit(0)
    } catch (err) {
        console.error('Seed failed:', err.message)
        process.exit(1)
    }
}

seed()