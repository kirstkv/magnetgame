# Post-it Sentence Game (Family Multiplayer)

Simple multiplayer game where each player gets a bank of words (up to 30). Players drag words onto a post-it note to make a sentence, submit, and the Judge picks the winner.

Features:
- Node + Express + Socket.IO server
- Uses `words.json` as word pool and `rooms.json` for simple persistence
- No external database required

Quick start
1. Install: npm install
2. Run: npm start
3. Open http://localhost:3000 and create or join a room (share the room code)

Notes
- Each player receives up to 30 words. After each round the server refills hands back to 30.
- This is designed as a lightweight family MVP (not for large-scale production).

---

## Deploying the backend (Render) 🔧

Recommended: deploy the Node/Express/Socket.IO server to Render and update the frontend to connect to it.

1. Create a new **Web Service** on Render and connect it to this GitHub repository (branch: `main`). You can also use the included `render.yaml` to prefill settings.
2. In Render, after creating the service, copy the **Service ID** and create an **API key** (service or account API key).
3. In your GitHub repo, go to Settings → Secrets and create two repository secrets:
   - `RENDER_API_KEY` — the API key from Render
   - `RENDER_SERVICE_ID` — the service id for your backend service
4. The provided GitHub Actions workflow at `.github/workflows/render-deploy.yml` will trigger a deploy on each push to `main` (it calls Render API to create a new deploy).
5. Update the frontend to point to your deployed backend: open `public/index.html` and add a small inline script before `app.js` that sets `window.BACKEND_URL`, for example:

```html
<script>window.BACKEND_URL = 'https://your-service.onrender.com';</script>
<script src="app.js"></script>
```

Alternatively, replace the placeholder in `public/app.js` (`https://<your-backend-url>`) with your Render URL.

Once the backend is deployed and `window.BACKEND_URL` is set, the Create Room / socket features on the GitHub Pages frontend will work.

Single-room mode
----------------
This simplified deployment uses a single in-memory room. The server does not persist rooms to disk; all game state is temporary and will reset when the server restarts. The frontend uses a single shared room — press **Join Game** to join the live game. This keeps the app simple for parties/small groups where only one room is required.


