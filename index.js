if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}
const express = require('express')
const app = express()
const pool = require('./db')
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
app.use(express.json())

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    next()
})

app.post('/api/profiles', async (req, res) => {
    const name = req.body.name

    if (name === undefined || name === null) {
        return res.status(400).json({ status: 'error', message: 'Missing or empty name' })
    }

    if (typeof name !== 'string' || name.trim() === '') {
        return res.status(422).json({ status: 'error', message: 'Invalid type' })
    }

    try {
        // check if profile already exists
        const existing = await pool.query(
            'SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)', [name]
        )
        if (existing.rows.length > 0) {
            return res.status(200).json({
                status: 'success',
                message: 'Profile already exists',
                data: existing.rows[0]
            })
        }

        // call all three APIs at the same time
        const [genderRes, ageRes, nationRes] = await Promise.all([
            fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`),
            fetch(`https://api.agify.io?name=${encodeURIComponent(name)}`),
            fetch(`https://api.nationalize.io?name=${encodeURIComponent(name)}`)
        ])

        const [genderData, ageData, nationData] = await Promise.all([
            genderRes.json(),
            ageRes.json(),
            nationRes.json()
        ])

        // edge case checks
        if (!genderData.gender || genderData.count === 0) {
            return res.status(502).json({ status: 'error', message: 'Genderize returned an invalid response' })
        }
        if (!ageData.age) {
            return res.status(502).json({ status: 'error', message: 'Agify returned an invalid response' })
        }
        if (!nationData.country || nationData.country.length === 0) {
            return res.status(502).json({ status: 'error', message: 'Nationalize returned an invalid response' })
        }

        // age group classification
        let age_group
        if (ageData.age <= 12) age_group = 'child'
        else if (ageData.age <= 19) age_group = 'teenager'
        else if (ageData.age <= 59) age_group = 'adult'
        else age_group = 'senior'

        // top country by highest probability
        const topCountry = nationData.country.reduce((best, current) => {
            return current.probability > best.probability ? current : best
        })

        // generate id and timestamp
        const id = uuidv7()
        const created_at = new Date().toISOString()

        // save to database
        await pool.query(
            `INSERT INTO profiles 
            (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, name.toLowerCase(), genderData.gender, genderData.probability, genderData.count,
            ageData.age, age_group, topCountry.country_id, topCountry.probability, created_at]
        )

        // return success response
        return res.status(201).json({
            status: 'success',
            data: {
                id,
                name: name.toLowerCase(),
                gender: genderData.gender,
                gender_probability: genderData.probability,
                sample_size: genderData.count,
                age: ageData.age,
                age_group,
                country_id: topCountry.country_id,
                country_probability: topCountry.probability,
                created_at
            }
        })

    } catch (err) {
    console.error(err)
    return res.status(500).json({ status: 'error', message: err.message })

        // console.error(err)
        // return res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
})

app.get('/api/profiles', async (req, res) => {
    const { gender, country_id, age_group } = req.query

    try {
        let query = 'SELECT * FROM profiles WHERE 1=1'
        const params = []

        if (gender) {
            params.push(gender.toLowerCase())
            query += ` AND LOWER(gender) = $${params.length}`
        }

        if (country_id) {
            params.push(country_id.toUpperCase())
            query += ` AND UPPER(country_id) = $${params.length}`
        }

        if (age_group) {
            params.push(age_group.toLowerCase())
            query += ` AND LOWER(age_group) = $${params.length}`
        }

        const result = await pool.query(query, params)

        return res.status(200).json({
            status: 'success',
            count: result.rows.length,
            data: result.rows
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
})


app.get('/api/profiles/:id', async (req, res) => {
    const { id } = req.params

    try {
        const result = await pool.query(
            'SELECT * FROM profiles WHERE id = $1', [id]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' })
        }

        return res.status(200).json({
            status: 'success',
            data: result.rows[0]
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
})

app.delete('/api/profiles/:id', async (req, res) => {
    const { id } = req.params

    try {
        const result = await pool.query(
            'DELETE FROM profiles WHERE id = $1 RETURNING *', [id]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' })
        }

        return res.status(204).send()

    } catch (err) {
        console.error(err)
        return res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
})
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})