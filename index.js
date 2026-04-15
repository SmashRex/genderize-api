const express = require('express')
const app = express()

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    next()
})

app.get('/api/classify', async (req, res) => {
    const name = req.query.name

    if (!name || name.trim() === '') {
        return res.status(400).json({ status: 'error', message: 'Missing or empty name parameter' })
    }
try {
    const response = await fetch(`https://api.genderize.io/?name=${encodeURIComponent(name)}`)
    const data = await response.json()

    if (!data.gender || data.count === 0) {
    return res.status(200).json({ status: 'error', message: 'No prediction available for the provided name' })
}

    const sample_size = data.count
    const is_confident = data.probability >= 0.7 && sample_size >= 100
    const processed_at = new Date().toISOString()

    return res.status(200).json({
        status: 'success',
        data: {
            name: data.name,
            gender: data.gender,
            probability: data.probability,
            sample_size,
            is_confident,
            processed_at
        }
    }) 
} catch (err) {
    return res.status(500).json({ status: 'error', message: 'Internal server error' })
}
   
})  

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})