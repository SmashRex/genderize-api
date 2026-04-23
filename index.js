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
    const {
        gender,
        age_group,
        country_id,
        min_age,
        max_age,
        min_gender_probability,
        min_country_probability,
        sort_by,
        order,
        page,
        limit
    } = req.query

    // validate sort_by
    const allowedSortFields = ['age', 'created_at', 'gender_probability']
    const allowedOrders = ['asc', 'desc']

    if (sort_by && !allowedSortFields.includes(sort_by)) {
        return res.status(400).json({ status: 'error', message: 'Invalid query parameters' })
    }

    if (order && !allowedOrders.includes(order.toLowerCase())) {
        return res.status(400).json({ status: 'error', message: 'Invalid query parameters' })
    }

    try {
        // pagination
        const pageNum = parseInt(page) || 1
        const limitNum = Math.min(parseInt(limit) || 10, 50)
        const offset = (pageNum - 1) * limitNum

        // build query
        let conditions = []
        let params = []

        if (gender) {
            params.push(gender.toLowerCase())
            conditions.push(`LOWER(gender) = $${params.length}`)
        }
        if (age_group) {
            params.push(age_group.toLowerCase())
            conditions.push(`LOWER(age_group) = $${params.length}`)
        }
        if (country_id) {
            params.push(country_id.toUpperCase())
            conditions.push(`UPPER(country_id) = $${params.length}`)
        }
        if (min_age) {
            params.push(parseInt(min_age))
            conditions.push(`age >= $${params.length}`)
        }
        if (max_age) {
            params.push(parseInt(max_age))
            conditions.push(`age <= $${params.length}`)
        }
        if (min_gender_probability) {
            params.push(parseFloat(min_gender_probability))
            conditions.push(`gender_probability >= $${params.length}`)
        }
        if (min_country_probability) {
            params.push(parseFloat(min_country_probability))
            conditions.push(`country_probability >= $${params.length}`)
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const sortField = sort_by || 'created_at'
        const sortOrder = (order || 'asc').toUpperCase()

        // get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM profiles ${where}`,
            params
        )
        const total = parseInt(countResult.rows[0].count)

        // get paginated results
        const dataResult = await pool.query(
            `SELECT * FROM profiles ${where} ORDER BY ${sortField} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limitNum, offset]
        )

        return res.status(200).json({
            status: 'success',
            page: pageNum,
            limit: limitNum,
            total,
            data: dataResult.rows
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ status: 'error', message: 'Internal server error' })
    }
})


// Stage 2 - GET natural language search
app.get('/api/profiles/search', async (req, res) => {
    const q = req.query.q

    // If no query string was provided at all, return an error
    if (!q || q.trim() === '') {
        return res.status(400).json({ status: 'error', message: 'Missing search query' })
    }

    // Convert the query to lowercase so matching is case-insensitive
    // e.g. "Nigeria" and "nigeria" both work
    const query = q.toLowerCase()

    // ── GENDER DETECTION ───────────────────────────────────────────
    // We check if any male or female keywords appear anywhere in the query string
    let gender = null

    const maleWords = ['male', 'males', 'man', 'men']
    const femaleWords = ['female', 'females', 'woman', 'women']

    // .some() returns true if at least one item in the array passes the test
    // Here the test is: does the query include this word?
    if (femaleWords.some(w => query.includes(w))) {
        gender = 'female'
    } else if (maleWords.some(w => query.includes(w))) {
        // We check female FIRST because "female" contains "male"
        // If we checked male first, "female" would accidentally match male
        gender = 'male'
    }

    // ── AGE GROUP DETECTION ────────────────────────────────────────
    // age_group is a stored column value: child, teenager, adult, senior
    // "young" is special — it's not a stored value, it maps to an age range instead
    let age_group = null

    if (query.includes('child') || query.includes('children')) {
        age_group = 'child'
    } else if (query.includes('teenager') || query.includes('teenagers') ||
               query.includes('teen') || query.includes('teens')) {
        age_group = 'teenager'
    } else if (query.includes('adult') || query.includes('adults')) {
        age_group = 'adult'
    } else if (query.includes('senior') || query.includes('seniors') ||
               query.includes('elderly') || query.includes('old')) {
        age_group = 'senior'
    }

    // ── "YOUNG" → AGE RANGE ────────────────────────────────────────
    // "young" doesn't map to a stored age_group, so we treat it as a numeric range
    // min_age and max_age will become SQL WHERE conditions: age >= X and age <= Y
    let min_age = null
    let max_age = null

    if (query.includes('young')) {
        min_age = 16
        max_age = 24
    }

    // ── NUMERIC AGE PHRASES ────────────────────────────────────────
    // Detect phrases like "above 30", "under 18", "older than 25"
    // We use a regular expression (regex) to find a number after the keyword
    // \s* means zero or more spaces, (\d+) captures one or more digits

    const aboveMatch = query.match(/(?:above|over|older than)\s*(\d+)/)
    if (aboveMatch) {
        // aboveMatch[1] is the captured number as a string, parseInt converts to integer
        min_age = parseInt(aboveMatch[1])
    }

    const belowMatch = query.match(/(?:below|under|younger than)\s*(\d+)/)
    if (belowMatch) {
        max_age = parseInt(belowMatch[1])
    }

    // ── COUNTRY DETECTION ──────────────────────────────────────────
    // We map country name mentions to their ISO country_id codes
    // These must match what is stored in the database (e.g. "NG", "KE")
    const countryMap = {
        'nigeria': 'NG', 'kenya': 'KE', 'ghana': 'GH', 'tanzania': 'TZ',
        'ethiopia': 'ET', 'uganda': 'UG', 'south africa': 'ZA', 'senegal': 'SN',
        'cameroon': 'CM', 'ivory coast': 'CI', 'cote d ivoire': 'CI',
        'mali': 'ML', 'angola': 'AO', 'mozambique': 'MZ', 'zambia': 'ZM',
        'zimbabwe': 'ZW', 'rwanda': 'RW', 'morocco': 'MA', 'egypt': 'EG',
        'sudan': 'SD', 'algeria': 'DZ', 'tunisia': 'TN', 'benin': 'BJ',
        'burkina faso': 'BF', 'dr congo': 'CD', 'congo': 'CD',
        'madagascar': 'MG', 'botswana': 'BW', 'namibia': 'NA', 'malawi': 'MW',
        'somalia': 'SO', 'eritrea': 'ER', 'liberia': 'LR', 'guinea': 'GN',
        'togo': 'TG', 'niger': 'NE', 'chad': 'TD', 'gabon': 'GA',
        'burundi': 'BI', 'djibouti': 'DJ', 'mauritania': 'MR',
        'sierra leone': 'SL', 'gambia': 'GM', 'cape verde': 'CV',
        'seychelles': 'SC', 'mauritius': 'MU', 'comoros': 'KM',
        'eswatini': 'SZ', 'lesotho': 'LS', 'central african republic': 'CF',
        'south sudan': 'SS', 'equatorial guinea': 'GQ', 'guinea-bissau': 'GW',
        'united states': 'US', 'usa': 'US', 'america': 'US',
        'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB',
        'france': 'FR', 'germany': 'DE', 'india': 'IN', 'china': 'CN',
        'brazil': 'BR', 'australia': 'AU', 'canada': 'CA', 'japan': 'JP',
        'libya': 'LY'
    }

    let country_id = null

    // We sort the keys by LENGTH (longest first) before checking
    // This is important: "south africa" must be checked before "africa" would
    // accidentally match something else. Longest = most specific = check first.
    const sortedCountries = Object.keys(countryMap).sort((a, b) => b.length - a.length)

    for (const countryName of sortedCountries) {
        if (query.includes(countryName)) {
            country_id = countryMap[countryName]
            break // Stop after the first match
        }
    }

    // ── CHECK: did we find ANYTHING useful? ───────────────────────
    // If all filters are still null, the query had no recognizable keywords
    const nothingFound = !gender && !age_group && min_age === null && max_age === null && !country_id

    if (nothingFound) {
        return res.status(200).json({ status: 'error', message: 'Unable to interpret query' })
    }

    // ── BUILD THE SQL QUERY ────────────────────────────────────────
    // We build the WHERE clause dynamically, same approach as GET /api/profiles
    // conditions[] holds each SQL condition as a string
    // params[] holds the actual values (PostgreSQL uses $1, $2... placeholders)
    try {
        const conditions = []
        const params = []

        if (gender) {
            params.push(gender)
            conditions.push(`LOWER(gender) = $${params.length}`)
        }
        if (age_group) {
            params.push(age_group)
            conditions.push(`LOWER(age_group) = $${params.length}`)
        }
        if (country_id) {
            params.push(country_id)
            conditions.push(`UPPER(country_id) = $${params.length}`)
        }
        if (min_age !== null) {
            params.push(min_age)
            conditions.push(`age >= $${params.length}`)
        }
        if (max_age !== null) {
            params.push(max_age)
            conditions.push(`age <= $${params.length}`)
        }

        const where = `WHERE ${conditions.join(' AND ')}`

        // ── PAGINATION ─────────────────────────────────────────────
        // Same logic as GET /api/profiles
        // Default: page 1, limit 10, never more than 50 per page
        const pageNum = parseInt(req.query.page) || 1
        const limitNum = Math.min(parseInt(req.query.limit) || 10, 50)
        const offset = (pageNum - 1) * limitNum

        // First query: count total matching rows (for the total field in response)
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM profiles ${where}`, params
        )
        const total = parseInt(countResult.rows[0].count)

        // Second query: get the actual rows for this page
        const dataResult = await pool.query(
            `SELECT * FROM profiles ${where} ORDER BY created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limitNum, offset]
        )

        return res.status(200).json({
            status: 'success',
            page: pageNum,
            limit: limitNum,
            total,
            data: dataResult.rows
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