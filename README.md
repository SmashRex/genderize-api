Here's the updated README covering Stage 2. Copy and replace your entire README.md with this:
markdown# Genderize API - Stage 2

A REST API that accepts a name, calls three external APIs (Genderize, Agify, Nationalize), classifies the result, stores it in a PostgreSQL database, and exposes endpoints to manage and search profiles.

## Base URL
https://genderize-api-rouge.vercel.app

---

## Endpoints

### 1. Classify Name (Stage 0)
**GET** `/api/classify?name=ella`

Success Response (200):
```json
{
  "status": "success",
  "data": {
    "name": "ella",
    "gender": "female",
    "probability": 0.99,
    "sample_size": 97517,
    "is_confident": true,
    "processed_at": "2026-04-17T21:29:11.284Z"
  }
}
```

---

### 2. Create Profile
**POST** `/api/profiles`

Request body:
```json
{ "name": "ella" }
```

Success Response (201):
```json
{
  "status": "success",
  "data": {
    "id": "019d9d31-a285-75d8-9911-39577f465842",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 97517,
    "age": 53,
    "age_group": "adult",
    "country_id": "CM",
    "country_probability": 0.09,
    "created_at": "2026-04-17T21:29:11.284Z"
  }
}
```

If the same name is submitted again:
```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { "...existing profile..." }
}
```

---

### 3. Get All Profiles
**GET** `/api/profiles`

Supports filtering, sorting, and pagination via query parameters.

**Filter parameters:**
| Parameter | Example | Description |
|---|---|---|
| `gender` | `?gender=male` | Filter by gender |
| `age_group` | `?age_group=adult` | Filter by age group |
| `country_id` | `?country_id=NG` | Filter by ISO country code |
| `min_age` | `?min_age=18` | Minimum age (inclusive) |
| `max_age` | `?max_age=40` | Maximum age (inclusive) |
| `min_gender_probability` | `?min_gender_probability=0.8` | Minimum gender probability |
| `min_country_probability` | `?min_country_probability=0.5` | Minimum country probability |

**Sort parameters:**
| Parameter | Example | Description |
|---|---|---|
| `sort_by` | `?sort_by=age` | Sort by `age`, `created_at`, or `gender_probability` |
| `order` | `?order=desc` | Sort direction: `asc` or `desc` |

**Pagination parameters:**
| Parameter | Example | Description |
|---|---|---|
| `page` | `?page=2` | Page number (default: 1) |
| `limit` | `?limit=20` | Results per page (default: 10, max: 50) |

Filters can be combined freely:
```
GET /api/profiles?gender=male&country_id=NG&sort_by=age&order=desc&page=1&limit=20
```

Success Response (200):
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 120,
  "data": [...]
}
```

---

### 4. Natural Language Search
**GET** `/api/profiles/search?q=young males from nigeria`

Parses a plain English query and converts it to database filters. Supports the same `page` and `limit` pagination parameters as GET /api/profiles.

**Supported keywords:**

| Category | Keywords | Result |
|---|---|---|
| Gender | `male`, `males`, `man`, `men` | gender = male |
| Gender | `female`, `females`, `woman`, `women` | gender = female |
| Age group | `child`, `children` | age_group = child |
| Age group | `teen`, `teens`, `teenager`, `teenagers` | age_group = teenager |
| Age group | `adult`, `adults` | age_group = adult |
| Age group | `senior`, `seniors`, `elderly`, `old` | age_group = senior |
| Age range | `young` | age between 16 and 24 |
| Age range | `above X`, `over X`, `older than X` | min_age = X |
| Age range | `below X`, `under X`, `younger than X` | max_age = X |
| Country | `nigeria`, `kenya`, `ghana`, etc. | country_id = ISO code |

Example queries:
```
GET /api/profiles/search?q=young males from nigeria
GET /api/profiles/search?q=females above 30
GET /api/profiles/search?q=adult males from kenya
GET /api/profiles/search?q=seniors from ghana
```

Success Response (200):
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 9,
  "data": [...]
}
```

If the query contains no recognizable keywords:
```json
{ "status": "error", "message": "Unable to interpret query" }
```

---

### 5. Get Single Profile
**GET** `/api/profiles/:id`

Success Response (200):
```json
{
  "status": "success",
  "data": { "...profile..." }
}
```

---

### 6. Delete Profile
**DELETE** `/api/profiles/:id`

Returns `204 No Content` on success.

---

## Error Responses

All errors follow this format:
```json
{ "status": "error", "message": "" }
```

| Status | Meaning |
|---|---|
| 400 | Missing or empty name / invalid query parameters |
| 422 | name is not a string |
| 404 | Profile not found |
| 502 | External API returned invalid response |
| 500 | Internal server error |

---

## Classification Logic

**Age group** (from Agify):
- 0–12 → child
- 13–19 → teenager
- 20–59 → adult
- 60+ → senior

**Nationality** (from Nationalize):
- Country with the highest probability is selected

---

## External APIs Used

- [Genderize.io](https://genderize.io) — gender prediction
- [Agify.io](https://agify.io) — age prediction
- [Nationalize.io](https://nationalize.io) — nationality prediction

---

## Database

PostgreSQL hosted on [Neon](https://neon.tech). The `profiles` table contains 2026 seeded profiles plus any created via the POST endpoint.

| Column | Type | Notes |
|---|---|---|
| id | TEXT | UUID v7, primary key |
| name | TEXT | unique |
| gender | TEXT | male or female |
| gender_probability | NUMERIC | |
| sample_size | INTEGER | null for seeded profiles |
| age | INTEGER | |
| age_group | TEXT | child, teenager, adult, senior |
| country_id | TEXT | ISO code e.g. NG, KE |
| country_name | TEXT | full country name |
| country_probability | NUMERIC | |
| created_at | TIMESTAMP | |

---

## How to Run Locally

```bash
npm install
```

Create a `.env` file:
```
DATABASE_URL=your_neon_postgresql_connection_string
```

Run the server:
```bash
node index.js
```

Server runs on `http://localhost:3000`

---

## Tech Stack

- Node.js (CommonJS)
- Express
- PostgreSQL (Neon)
- Vercel (deployment)