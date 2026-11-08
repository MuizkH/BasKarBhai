# Voice Accountability AI

An AI-powered doomscrolling accountability application for Android with a modular Node.js / Express backend.

## Architecture

- **`backend/`**: Node.js / Express backend foundation using ES Modules, Helmet security, CORS, centralized error handling, and Zod environment validation.
- **`android/`**: Android application client (upcoming).

## Backend Setup & Quickstart

### Prerequisites
- Node.js (>= 18)
- npm

### Installation
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up the environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Run the development server (with hot reload):
   ```bash
   npm run dev
   ```
   Or run in production mode:
   ```bash
   npm start
   ```

### Health Check Endpoint
- **URL**: `GET http://localhost:5000/api/health`
- **Response**:
  ```json
  {
    "success": true,
    "message": "Voice Accountability API is running"
  }
  ```

