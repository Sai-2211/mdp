# Miniature EV Charger – Secure Mobile App (MVP)

React Native (Expo) mobile app for a miniature EV charger system controlled by an ESP32.

**Important:** The app **never** communicates directly with the ESP32. All communication flows through a backend server:

Mobile App → Backend Server → ESP32

## Features (MVP)

- User registration & login (JWT)
- Secure token storage (`expo-secure-store`)
- Charger status (online/offline + idle/charging/unavailable)
- Secure start/stop charging requests (via backend authorization)
- Live telemetry via WebSocket (auto reconnect)
- Session history + session details
- Profile + logout
- Mock/fallback mode for UI testing without a backend

## Configuration

Set these Expo public env vars (recommended) when running:

- `EXPO_PUBLIC_API_BASE_URL` (example: `https://api.example.com`)
- `EXPO_PUBLIC_WS_URL` (example: `wss://api.example.com/charging/live`)
- `EXPO_PUBLIC_USE_MOCK` (`true` / `false`)
- `EXPO_PUBLIC_WS_AUTH_MODE` (`header` / `query`) — defaults to `header`
- `EXPO_PUBLIC_COST_PER_KWH` (example: `0.20`)
- `EXPO_PUBLIC_CURRENCY_SYMBOL` (example: `$`)

Example:

```bash
EXPO_PUBLIC_API_BASE_URL="http://localhost:3000" \
EXPO_PUBLIC_WS_URL="ws://localhost:3000/charging/live" \
EXPO_PUBLIC_USE_MOCK="true" \
npm start
```

## Backend API (expected)

This app expects the backend to expose:

- `POST /auth/register`
- `POST /auth/login`
- `GET /charger/status`
- `POST /charging/start`
- `POST /charging/stop`
- `GET /sessions`
- `GET /sessions/{sessionId}`

Live telemetry is consumed from:

- `ws(s)://<backend>/charging/live`


## Run

```bash
npm install
npm start
```
