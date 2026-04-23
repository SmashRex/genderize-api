# Genderize API - Stage 2

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

Success Response (200):
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "total_pages": 203,
  "data": [...]
}
```

---

### 4. Natural Language Search
**GET** `/api/profiles/search?q=young males from nigeria`

Parses a plain English query and converts it to database filters. Supports the same `page` and `limit` pagination as GET /api/profiles.

Success Response (200):
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 9,
  "total_pages": 1,
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

## Natural Language Parsing — How It Works

The `/api/profiles/search` endpoint uses **rule-based keyword matching only** — no AI or LLMs are involved. The query string is converted to lowercase and scanned for known keywords. Each recognized keyword maps directly to a SQL filter.

### Gender Keywords
| Keyword(s) | Maps To |
|---|---|
| `male`, `males`, `man`, `men` | `gender = male` |
| `female`, `females`, `woman`, `women` | `gender = female` |

> `female` is checked before `male` because the word "female" contains "male". Checking female first prevents a false match.

### Age Group Keywords
| Keyword(s) | Maps To |
|---|---|
| `child`, `children` | `age_group = child` |
| `teen`, `teens`, `teenager`, `teenagers` | `age_group = teenager` |
| `adult`, `adults` | `age_group = adult` |
| `senior`, `seniors`, `elderly`, `old` | `age_group = senior` |

### Age Range Keywords
| Keyword(s) | Maps To |
|---|---|
| `young` | `age >= 16 AND age <= 24` |
| `above X`, `over X`, `older than X` | `age >= X` |
| `below X`, `under X`, `younger than X` | `age <= X` |

> `young` is not a stored age group. It is a parsing convenience that maps to the 16–24 age range.

### Country Keywords
Country names are matched as substrings and mapped to ISO country codes:

| Keyword(s) | Country ID |
|---|---|
| `nigeria` | NG |
| `kenya` | KE |
| `ghana` | GH |
| `tanzania` | TZ |
| `ethiopia` | ET |
| `uganda` | UG |
| `south africa` | ZA |
| `senegal` | SN |
| `cameroon` | CM |
| `ivory coast`, `cote d ivoire` | CI |
| `angola` | AO |
| `egypt` | EG |
| `morocco` | MA |
| `united states`, `usa`, `america` | US |
| `united kingdom`, `uk`, `britain` | GB |
| `france` | FR |
| `germany` | DE |
| `india` | IN |
| `china` | CN |
| `brazil` | BR |
| `australia` | AU |
| `canada` | CA |
| `japan` | JP |
| *(and 40+ more African countries)* | *(see source code)* |

> Countries are sorted by name length (longest first) before matching. This ensures multi-word names like "south africa" are matched before shorter overlapping names.

### How Filters Combine
All recognized keywords are applied together as AND conditions in the SQL query. For example:

`"young males from nigeria"` → `gender = male AND age >= 16 AND age <= 24 AND country_id = NG`

### Unrecognizable Queries
If no keywords are recognized at all, the endpoint returns:
```json
{ "status": "error", "message": "Unable to interpret query" }
```

---

## Limitations

- **No synonyms or fuzzy matching** — only exact keyword matches work. "guys" or "boys" will not match male.
- **No spelling correction** — "femele" or "nigria" will not be recognized.
- **No compound negation** — queries like "not from nigeria" or "excluding adults" are not supported.
- **Single country per query** — if multiple countries are mentioned, only the first match is used.
- **"young" conflicts with age_group** — if both "young" and an age group keyword appear, both filters apply which may return fewer or no results.
- **Numbers must be digits** — "above thirty" will not work, only "above 30".
- **No context awareness** — "people" or "profiles" alone return an error since they are not mapped keywords.
- **country_name column** — profiles created via POST do not currently store country_name. Only seeded profiles have this field populated.

---

## Error Responses

All errors follow this format:
```json
{ "status": "error", "message": "<reason>" }
```

| Status | Meaning |
|---|---|
| 400 | Missing/empty parameter or uninterpretable query |
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