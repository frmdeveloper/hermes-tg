# Hermes — Bot Telegram (Node.js)

Bot Telegram AI, backend-nya 9router lokal vela1 (`http://127.0.0.1:20128/v1`, OpenAI-compatible).
Zero-dependency (cuma Node >= 18, pakai fetch + long-polling bawaan).

## Ganti model dari bot
- `/model` — model aktif + daftar model (tombol, paginasi), ketuk buat ganti
- `/model <id>` — ganti langsung, mis. `/model coa/deepseek-v4-1-flash-1017`
- `/models` — sama kayak /model
- `/cari <kata>` — filter model, mis. `/cari gemini`
- Pilihan per-user, kesimpan di `data/state.json` (awet walau restart)

## Perintah lain
- `/reset` hapus riwayat chat · `/system <teks>` ganti system prompt · `/ping` tes 9router · `/help`

## Jalanin
```bash
cp .env.example .env   # isi TELEGRAM_BOT_TOKEN dari @BotFather
npm run test:router    # tes jalur ke 9router tanpa Telegram
pm2 start index.js --name hermes-tg
pm2 save
```
