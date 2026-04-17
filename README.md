# Genderize API - Stage 1

A REST API that accepts a name, calls three external APIs (Genderize, Agify, Nationalize), classifies the result, stores it in a PostgreSQL database, and exposes endpoints to manage profiles.

## Base URL
https://genderize-api-rouge.vercel.app
## Endpoints

### 1. Create Profile
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
  "data": { ...existing profile... }
}
```

---

### 2. Get All Profiles
**GET** `/api/profiles`

Optional filters:
- `?gender=male`
- `?country_id=NG`
- `?age_group=adult`
- Filters can be combined: `?gender=male&country_id=NG`

Success Response (200):
```json
{
  "status": "success",
  "count": 2,
  "data": [...]
}
```

---

### 3. Get Single Profile
**GET** `/api/profiles/:id`

Success Response (200):
```json
{
  "status": "success",
  "data": { ...profile... }
}
```

---

### 4. Delete Profile
**DELETE** `/api/profiles/:id`

Returns `204 No Content` on success.

---

## Error Responses

All errors follow this format:
```json
{ "status": "error", "message": "<reason>" }
```

| Status | Meaning |
|--------|---------|
| 400 | Missing or empty name |
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

## How to Run Locally

```bash
npm install
```

Create a `.env` file:
DATABASE_URL=your_neon_postgresql_connection_string

Run the server:
```bash
node index.js
```

Server runs on `http://localhost:3000`

---

## Tech Stack

- Node.js
- Express
- PostgreSQL (Neon)
- Vercel (deployment)