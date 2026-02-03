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

