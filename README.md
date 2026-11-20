# Hermes — Bot Telegram (Node.js) + Panduan Pasang Hermes Agent

Repo ini isinya **dua hal yang berbeda**. Baca dulu biar tidak ketuker:

| Bagian | Apa ini | Siapa yang bikin |
|---|---|---|
| `index.js` dkk (repo ini) | **Bot Telegram sendiri**, Node.js, zero-dependency | tulisan sendiri |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs) | **Program AI agent** (Python) yang punya gateway Telegram sendiri | Nous Research |

Keduanya **terpisah**. Bot di repo ini bukan bagian dari Hermes Agent, dan tidak butuh
Hermes Agent untuk jalan — cukup Node.js + satu backend LLM (OpenAI-compatible).
Boleh dipasang dua-duanya di mesin yang sama; lihat bagian
[Beda bot ini vs gateway Hermes](#7-beda-bot-ini-vs-gateway-hermes).

---

## Daftar isi

1. [Yang dibutuhkan](#1-yang-dibutuhkan)
2. [Pasang bot ini (hermes-tg)](#2-pasang-bot-ini-hermes-tg)
3. [Perintah bot](#3-perintah-bot)
4. [Jalan terus (pm2 / systemd)](#4-jalan-terus-pm2--systemd)
5. [Pasang Hermes Agent](#5-pasang-hermes-agent)
6. [Sambungkan Hermes ke Telegram](#6-sambungkan-hermes-ke-telegram)
7. [Beda bot ini vs gateway Hermes](#7-beda-bot-ini-vs-gateway-hermes)
8. [Troubleshooting](#8-troubleshooting)
9. [File di repo ini](#9-file-di-repo-ini)

---

## 1. Yang dibutuhkan

### Untuk bot ini

| Kebutuhan | Versi | Wajib? | Catatan |
|---|---|---|---|
| **Node.js** | **>= 18** | wajib | pakai `fetch` bawaan; diuji di Node 22 |
| **Bot token Telegram** | — | wajib | dari [@BotFather](https://t.me/BotFather) |
| **Backend LLM** OpenAI-compatible | — | wajib | 9router / Ollama / LM Studio / OpenRouter / OpenAI, dll |
| `pm2` | 5+ | opsional | biar bot hidup terus setelah logout |
| `npm install` | — | **tidak perlu** | benar-benar zero-dependency |

Cek versi Node:

```bash
node -v      # harus v18 atau lebih baru
```

Kalau belum ada Node 18+:

```bash
# Ubuntu/Debian via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Untuk Hermes Agent (bagian 5)

| Kebutuhan | Catatan |
|---|---|
| Linux / macOS / WSL2 | Windows native juga didukung (`install.ps1`) |
| Python 3.11 | installer yang menyiapkan sendiri lewat `uv` |
| Node.js + npm, ripgrep, FFmpeg | installer yang menyiapkan sendiri |
| ~1,5 GB disk | kode + venv + Chromium untuk browsing |
| Akun provider LLM | API key OpenAI/Anthropic/DeepSeek/OpenRouter, atau endpoint lokal |

---

## 2. Pasang bot ini (hermes-tg)

### 2.1 Clone

```bash
git clone https://github.com/frmdeveloper/hermes-tg.git
cd hermes-tg
```

### 2.2 Buat bot di BotFather

1. Buka [@BotFather](https://t.me/BotFather) di Telegram
2. Kirim `/newbot`
3. Isi **display name** (bebas, mis. `Hermes`)
4. Isi **username** — harus unik dan berakhiran `bot` (mis. `hermes_frm_bot`)
5. BotFather membalas **token** berbentuk `123456789:ABCdefGHI...`

> Token ini setara password bot. Jangan di-commit, jangan dikirim ke orang lain.
> Kalau bocor: `/revoke` di BotFather.

### 2.3 Siapkan backend LLM

Bot ini bicara ke endpoint **OpenAI-compatible** apa saja. Tiga pilihan:

**a) 9router** — satu endpoint, ratusan model:

```bash
npm install -g 9router
9router          # jalan di http://127.0.0.1:20128/v1
```

Cek jalan:

```bash
curl -s http://127.0.0.1:20128/v1/models | head -c 200
```

**b) Ollama** (lokal, gratis):

```bash
ollama serve                       # http://127.0.0.1:11434/v1
ollama pull qwen2.5:7b
```

**c) OpenAI / OpenRouter** (cloud):

```
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
DEFAULT_MODEL=gpt-4o-mini
```

### 2.4 Isi `.env`

```bash
cp .env.example .env
nano .env
```

Isi minimal:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
AI_BASE_URL=http://127.0.0.1:20128/v1
AI_API_KEY=
DEFAULT_MODEL=chatbot
ALLOWED_IDS=
```

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | wajib | — | token dari BotFather. Kosong = bot keluar dengan pesan error |
| `AI_BASE_URL` | tidak | `http://127.0.0.1:20128/v1` | endpoint OpenAI-compatible, **tanpa** `/chat/completions` di belakang |
| `AI_API_KEY` | tidak | kosong | isi kalau backend minta key. 9router lokal biasanya tidak perlu |
| `DEFAULT_MODEL` | tidak | `chatbot` | id model awal; bisa diganti dari bot dengan `/model` |
| `ALLOWED_IDS` | tidak | kosong | ID Telegram yang boleh pakai, pisah koma. **Kosong = siapa saja boleh** |
| `SYSTEM_PROMPT` | tidak | persona Hermes | prompt sistem bawaan |

> **Penting:** kalau `ALLOWED_IDS` dibiarkan kosong, siapa pun yang menemukan bot
> Anda bisa memakai kuota LLM Anda. Bot akan membalas `Bot ini privat. ID kamu: <angka>`
> — kirim angka itu ke bot, lalu masukkan ke `ALLOWED_IDS`, lalu restart.

### 2.5 Tes jalur LLM dulu (tanpa Telegram)

```bash
npm run test:router
```

Keluaran sehat:

```
OK /models: 575 model. Contoh: chatbot, nvidia/minimaxai/minimax-m2.7, ...
OK completion [chatbot] (4253ms): 2
OK completion [coa/deepseek-v4-1-flash-1017] (852ms): 2
TES ROUTER LULUS — jalur bot -> 9router -> model (termasuk ganti model) jalan.
```

Kalau langkah ini gagal, masalahnya di backend — jangan lanjut ke Telegram.

### 2.6 Jalankan

```bash
node index.js
```

Keluaran sehat:

```
[hermes] jalan sebagai @hermes_frm_bot — backend http://127.0.0.1:20128/v1, model bawaan chatbot
```

Buka Telegram, kirim `/start` ke bot Anda, lalu tanya apa saja.
Hentikan dengan `Ctrl+C`.

---

## 3. Perintah bot

Kirim pesan biasa → langsung dijawab AI.

| Perintah | Fungsi |
|---|---|
| `/model` | tampilkan model aktif + daftar model (tombol, paginasi 8/halaman) |
| `/model <id>` | ganti model langsung, mis. `/model chatbot` |
| `/daftar` | semua model yang tersedia (tombol) |
| `/cari <kata>` | filter model, mis. `/cari deepseek` |
| `/hapus` | hapus riwayat percakapan user itu |
| `/sistem <teks>` | ganti prompt sistem pribadi |
| `/sistem ulang` | kembalikan prompt sistem ke bawaan |
| `/tes` | uji koneksi ke backend + jumlah model terbaca |
| `/bantuan` | daftar perintah |
| `/ping` | alias `/tes` |
| `/reset` | alias `/hapus` |
| `/system` | alias `/sistem` |
| `/models` | alias `/model` |

Setiap user punya model, prompt sistem, dan riwayat sendiri (maks. 20 pesan
terakhir, disimpan di `data/state.json` — awet walau bot restart).

---

## 4. Jalan terus (pm2 / systemd)

### pm2 (paling gampang)

```bash
npm install -g pm2
cd hermes-tg
pm2 start index.js --name hermes-tg
pm2 save
pm2 startup          # ikuti perintah yang dicetak, supaya hidup setelah reboot
```

Perintah harian:

```bash
pm2 logs hermes-tg          # lihat log
pm2 restart hermes-tg       # setelah ubah .env
pm2 stop hermes-tg
pm2 delete hermes-tg
```

### systemd (tanpa npm global)

`~/.config/systemd/user/hermes-tg.service`:

```ini
[Unit]
Description=Hermes Telegram bot
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/hermes-tg
ExecStart=/usr/bin/node %h/hermes-tg/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now hermes-tg
loginctl enable-linger "$USER"     # tetap hidup setelah logout
systemctl --user status hermes-tg
journalctl --user -u hermes-tg -f
```

---

## 5. Pasang Hermes Agent

Bagian ini terpisah dari bot di atas. Ikuti hanya kalau Anda mau **agen penuh**
(akses terminal, file, browser, cron, memory, skill) yang bisa diajak chat.

### 5.1 Install

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

Yang dilakukan installer:

- clone kode ke `~/.hermes/hermes-agent`
- bootstrap `uv`, Python 3.11, Node.js, npm, ripgrep, FFmpeg
- bikin venv + install dependensi Python (extra `all`)
- pasang Chromium (Chrome for Testing) untuk browsing + `cua-driver`
  (kalau unduhan gagal, install tetap selesai dan mencetak perintah retry)
- taruh launcher `hermes` di `~/.local/bin`

Pastikan `~/.local/bin` ada di PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
hermes --version
```

### 5.2 Setup provider model

```bash
hermes setup      # wizard interaktif
hermes doctor     # cek kesehatan instalasi
```

`hermes setup` menanyakan provider + API key, lalu menulis:

- `~/.hermes/config.yaml` → setting (model, provider, display, gateway)
- `~/.hermes/.env` → **hanya** rahasia (API key, token bot)

Aturan penting: **rahasia di `.env`, setting di `config.yaml`.** Jangan taruh
API key di `config.yaml`, jangan taruh preferensi tampilan di `.env`.

### 5.3 Pakai endpoint lokal (9router / Ollama)

Kalau tidak mau bayar API cloud, arahkan Hermes ke endpoint OpenAI-compatible lokal:

```bash
hermes config set model.provider custom
hermes config set model.base_url http://127.0.0.1:20128/v1
hermes config set model.default chatbot
```

Untuk backend tanpa auth, isi `CUSTOM_API_KEY` di `~/.hermes/.env` dengan nilai
apa saja (mis. `dummy`) — tidak diverifikasi oleh endpoint yang tidak memeriksa auth.

Daftar model yang tersedia di endpoint itu:

```bash
curl -s http://127.0.0.1:20128/v1/models | python3 -c \
  "import sys,json;print('\n'.join(m['id'] for m in json.load(sys.stdin)['data']))" | head -20
```

Ganti model kapan saja dari dalam chat dengan `/model <id>`.

### 5.4 Coba di terminal

```bash
hermes chat -q "Halo, siapa kamu?"
hermes            # sesi interaktif
```

---

## 6. Sambungkan Hermes ke Telegram

Kalau Anda mau **agen penuh** bisa dihubungi lewat Telegram (bukan cuma bot
ringan di atas), Hermes punya gateway Telegram sendiri.

### 6.1 Siapkan token

Boleh pakai bot yang sama dengan langkah 2, **tapi jangan jalankan dua-duanya
sekaligus** — Telegram hanya izinkan satu poller per token (lihat
[Troubleshooting](#8-troubleshooting)). Lebih aman bikin bot kedua di BotFather.

### 6.2 Cara cepat (dashboard)

```bash
hermes dashboard
```

Buka **Messaging → Telegram** → **Create with QR**, scan dengan HP. Hermes
membuat bot, mendeteksi user ID Anda, menulis `TELEGRAM_BOT_TOKEN` +
`TELEGRAM_ALLOWED_USERS` ke `.env`, dan restart gateway.

### 6.3 Cara manual

Tambahkan ke `~/.hermes/.env`:

```dotenv
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_ALLOWED_USERS=1383538293
```

(`TELEGRAM_ALLOWED_USERS` = ID Telegram Anda; tanpa ini orang lain bisa
menyuruh agen menjalankan perintah di server Anda.)

### 6.4 Jalankan gateway

```bash
hermes gateway run            # foreground, bagus buat debugging
# atau sebagai service:
hermes gateway install --start-now
hermes gateway status
```

Setelah `connected`, chat bot Anda di Telegram — sekarang yang menjawab adalah
agen penuh (bisa baca file, jalankan shell, browsing, cron).

Log:

```bash
hermes logs --follow
tail -f ~/.hermes/logs/gateway.log
```

---

## 7. Beda bot ini vs gateway Hermes

| | Bot `hermes-tg` (repo ini) | Gateway Telegram Hermes Agent |
|---|---|---|
| Bahasa | Node.js, zero-dep | Python (python-telegram-bot) |
| Butuh Hermes Agent | tidak | wajib |
| Kemampuan | chat + ganti model + prompt sistem | chat + terminal + file + browser + cron + memory + skill + voice |
| Riwayat | 20 pesan/user, file JSON | SQLite penuh, bisa dicari, kompresi konteks |
| Indikator "mengetik" | sekali per pesan (hilang setelah ~5 detik) | di-refresh tiap 2 detik selama proses |
| Streaming jawaban | tidak (kirim utuh) | ya, native draft (`sendMessageDraft`) |
| Cocok untuk | bot chat ringan, hemat resource | asisten penuh yang mengerjakan tugas |

**Kalau dua-duanya jalan di satu mesin:** pakai **token bot berbeda**.
Satu token = satu poller.

---

## 8. Troubleshooting

### `TELEGRAM_BOT_TOKEN kosong` lalu bot keluar

`.env` belum ada atau variabelnya kosong. `cp .env.example .env`, isi token,
jalankan ulang.

### `Telegram getUpdates: Conflict: terminated by other getUpdates request`

Ada **proses lain** yang memakai token yang sama. Cek:

```bash
ps aux | grep -i "index.js\|gateway run" | grep -v grep
```

Matikan salah satunya. Penyebab umum: bot ini dan gateway Hermes memakai token
yang sama, atau `pm2` masih jalan padahal Anda juga menjalankan `node index.js`
manual.

### Bot diam saja, tidak membalas

1. Cek prosesnya hidup: `pm2 logs hermes-tg`
2. Cek `/tes` di Telegram — kalau error, backend LLM-nya mati
3. Cek `ALLOWED_IDS`: kalau diisi tapi ID Anda tidak ada di situ, bot
   mengabaikan pesan Anda tanpa balasan
4. Pastikan bot belum di-*stop* di BotFather (`/mybots` → Bot → Bot Settings)

### `9router /models HTTP 500` / `401`

- Pastikan 9router jalan: `curl -s http://127.0.0.1:20128/v1/models`
- Kalau perlu key, isi `AI_API_KEY` di `.env`
- Kalau pakai Docker/WSL, `127.0.0.1` di dalam container bukan host —
  pakai `http://host.docker.internal:20128/v1` atau IP host

### Jawaban kosong terus

Model tidak mendukung format streaming yang dipakai. Coba model lain:

```
/model gpt-4o-mini
```

atau jalankan `npm run test:router` untuk melihat model mana yang bermasalah.

### Markdown rusak / pesan terpotong aneh

Bot memotong jawaban > 3900 karakter per baris dan mencoba `Markdown` lalu
fallback ke teks polos. Kalau masih aneh, model mengeluarkan Markdown tidak valid
— bukan bug bot.

### Bot mati setelah logout SSH

Proses tidak di-*detach*. Pakai `pm2` atau systemd (bagian 4), plus
`loginctl enable-linger "$USER"` untuk systemd user service.

### Ingin mematikan indikator "mengetik"

Di bot ini, hapus/komentari baris `sendChatAction` di `index.js` (baris ~217).
Di Hermes Agent, set `typing_indicator: false` untuk platform Telegram:

```bash
hermes config set platforms.telegram.typing_indicator false
hermes gateway restart
```

---

## 9. File di repo ini

| File | Fungsi |
|---|---|
| `index.js` | seluruh bot: long-polling Telegram, router ke backend LLM, semua slash command (~270 baris) |
| `test-router.js` | tes koneksi ke backend tanpa Telegram (2 completion: model bawaan + model hasil ganti) |
| `.env.example` | template env; **`.env` asli tidak di-commit** |
| `.gitignore` | kecualikan `.env`, `data/`, `node_modules/` |
| `package.json` | metadata + `npm start` / `npm run test:router` |

### Yang sengaja tidak di-commit

- `.env` — token bot Telegram + API key backend
- `data/state.json` — riwayat chat & model per user
- `node_modules/` — tidak dipakai (zero-dependency)

### Struktur `.env` (semua kunci)

```dotenv
TELEGRAM_BOT_TOKEN=
AI_BASE_URL=
AI_API_KEY=
DEFAULT_MODEL=
ALLOWED_IDS=
SYSTEM_PROMPT=
```

---

## Lisensi

Kode bot di repo ini bebas dipakai dan diubah. Hermes Agent adalah produk
[Nous Research](https://github.com/NousResearch/hermes-agent) dengan lisensi
terpisah — lihat repo resminya.
