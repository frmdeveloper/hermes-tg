# Hermes — Bot Telegram (Node.js)

Bot Telegram AI, backend-nya 9router lokal (`http://127.0.0.1:20128/v1`, OpenAI-compatible).
Zero-dependency — cuma butuh Node >= 18 (pakai `fetch` + long-polling bawaan, tanpa `node_modules`).

## Ganti model dari bot
- `/model` — model aktif + daftar model (tombol, paginasi), ketuk buat ganti
- `/model <id>` — ganti langsung, mis. `/model coa/deepseek-v4-1-flash-1017`
- `/models` — sama kayak `/model`
- `/cari <kata>` — filter model, mis. `/cari gemini`
- Pilihan per-user, kesimpan di `data/state.json` (awet walau restart)

## Perintah lain
- `/reset` hapus riwayat chat · `/system <teks>` ganti system prompt · `/ping` tes 9router · `/help`

## Jalanin
```bash
cp .env.example .env   # isi TELEGRAM_BOT_TOKEN dari @BotFather + AI_API_KEY
npm run test:router    # tes jalur ke 9router tanpa Telegram
pm2 start index.js --name hermes-tg
pm2 save
```

## File
| File | Fungsi |
|---|---|
| `index.js` | bot utama: long-polling Telegram + router ke 9router, semua slash command |
| `test-router.js` | tes koneksi ke endpoint model (tanpa token Telegram) |
| `.env.example` | template env — `.env` asli tidak di-commit |
| `package.json` | metadata + script `start` / `test:router` |

## Yang tidak di-commit
- `.env` — bot token Telegram & API key 9router
- `data/` — riwayat chat per user (`state.json`)
- `node_modules/`
