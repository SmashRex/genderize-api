# Genderize API Integration
## 📌 Overview
This project provides a backend API that integrates with the Genderize.io service. It exposes a single endpoint that fetches gender probability data, processes it with custom confidence logic, and returns a structured JSON response.

## ⚙️ Features
- External API Integration: Seamlessly calls Genderize.io using the name query parameter.
- Data Transformation: * Renames count to sample_size.
- Computes is_confident: Returns true only if probability >= 0.7 AND sample_size >= 100.
- Adds processed_at: Includes a current UTC timestamp in ISO 8601 format.

# Robust Error Handling:
- 400 Bad Request: Missing or empty name.
- 422 Unprocessable Entity: Name is not a string.
- 500 Internal Server Error: General server issues.
- 502 Bad Gateway: Upstream API (Genderize) failure.

### Edge Case Handling: Returns "No prediction available..." if gender is null or count is 0.

### CORS Support: Includes Access-Control-Allow-Origin: * for cross-domain accessibility.

## 🚀 API Reference
Get Gender Classification
HTTP
GET /api/classify?name={name}
✅ Success Response (200 OK)
JSON
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sample_size": 1234,
    "is_confident": true,
    "processed_at": "2026-04-01T12:00:00Z"
  }
}
❌ Error Responses
Missing Parameter (400):

JSON
{
  "status": "error",
  "message": "Missing or empty name parameter"
}
No Data Found (404/200 Edge Case):

JSON
{
  "status": "error",
  "message": "No prediction available for the provided name"
}
🛠️ Getting Started
1. Clone the repository
Bash
git clone https://github.com/SmashRex/genderize-api.git
cd genderize-api
2. Install dependencies
Bash
npm install
3. Run locally
Bash
node index.js
The server will start on http://localhost:3000.

4. Test the endpoint
Bash
curl "http://localhost:3000/api/classify?name=john"
🌐 Deployment
This project is configured for easy deployment on platforms like Vercel, Railway, Heroku, or AWS.

Ensure your server is configured to listen on the environment's dynamic port:

JavaScript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
