// Hermes — bot Telegram (Node.js, zero-dependency, long-polling)
// Backend AI: 9router lokal vela1 (OpenAI-compatible) http://127.0.0.1:20128/v1
// Model bisa diganti DARI BOT: /model, /models (tombol), /cari <kata>
// Setting model per-user, tersimpan di data/state.json (awet walau restart).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const DIR = path.dirname(fileURLToPath(import.meta.url))

// ---------- .env manual (tanpa dotenv) ----------
function muatEnv() {
  const f = path.join(DIR, ".env")
  if (!existsSync(f)) return
  for (const baris of readFileSync(f, "utf8").split("\n")) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}
muatEnv()

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const BASE_URL = (process.env.AI_BASE_URL || "http://127.0.0.1:20128/v1").replace(/\/$/, "")
const API_KEY = process.env.AI_API_KEY || ""
const MODEL_BAWAAN = process.env.DEFAULT_MODEL || "chatbot"
const SYSTEM_BAWAAN = process.env.SYSTEM_PROMPT ||
  "Kamu Hermes, asisten AI pribadi. Jawab dalam Bahasa Indonesia yang santai tapi jelas, singkat padat kecuali diminta detail. Jangan mengaku sebagai model lain."
const ALLOWED = (process.env.ALLOWED_IDS || "").split(",").map(s => s.trim()).filter(Boolean)
const TG = `https://api.telegram.org/bot${TOKEN}`

if (!TOKEN) {
  console.error("[hermes] TELEGRAM_BOT_TOKEN kosong — isi dulu di .env (token dari @BotFather), lalu restart.")
  process.exit(1)
}

// ---------- state per-user ----------
const DIR_DATA = path.join(DIR, "data")
mkdirSync(DIR_DATA, { recursive: true })
const FILE_STATE = path.join(DIR_DATA, "state.json")
let state = {}
try { state = JSON.parse(readFileSync(FILE_STATE, "utf8")) } catch {}
const simpan = () => { try { writeFileSync(FILE_STATE, JSON.stringify(state, null, 1)) } catch (e) { console.error("[state]", e.message) } }
const stateUser = (uid) => {
  if (!state[uid]) state[uid] = { model: MODEL_BAWAAN, system: null, history: [] }
  return state[uid]
}

// ---------- helper Telegram ----------
async function tg(method, body = {}) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`)
  return j.result
}
const kirim = (chatId, text, extra = {}) => tg("sendMessage", { chat_id: chatId, text, ...extra })

// Telegram max 4096 char; potong per paragraf/baris
async function kirimPanjang(chatId, text) {
  const potongan = []
  let sisa = String(text || "(jawaban kosong)")
  while (sisa.length > 3900) {
    let titik = sisa.lastIndexOf("\n", 3900)
    if (titik < 1000) titik = 3900
    potongan.push(sisa.slice(0, titik))
    sisa = sisa.slice(titik).trimStart()
  }
  if (sisa) potongan.push(sisa)
  for (const p of potongan) {
    try { await kirim(chatId, p, { parse_mode: "Markdown" }) }
    catch { await kirim(chatId, p) } // fallback teks polos kalau markdown rusak
  }
}

// ---------- 9router ----------
let cacheModel = { at: 0, list: [] }
async function daftarModel() {
  if (Date.now() - cacheModel.at < 5 * 60_000 && cacheModel.list.length) return cacheModel.list
  const r = await fetch(`${BASE_URL}/models`, { headers: API_KEY ? { authorization: `Bearer ${API_KEY}` } : {} })
  if (!r.ok) throw new Error(`9router /models HTTP ${r.status}`)
  const j = await r.json()
  cacheModel = { at: Date.now(), list: (j.data || []).map(d => d.id).filter(Boolean) }
  return cacheModel.list
}

// 9router selalu balas SSE stream — kumpulin delta.content-nya (reasoning_content diabaikan).
async function panggilRouter(model, messages) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!r.ok) throw new Error(`9router HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`)
  if ((r.headers.get("content-type") || "").includes("application/json")) {
    const j = await r.json()
    const c = j.choices?.[0]?.message?.content
    return (typeof c === "string" ? c : "").trim()
  }
  let teks = "", buf = ""
  const reader = r.body.getReader(), dec = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const baris = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!baris.startsWith("data:")) continue
      const data = baris.slice(5).trim()
      if (data === "[DONE]") continue
      try {
        const d = JSON.parse(data).choices?.[0]?.delta?.content
        if (typeof d === "string") teks += d
        else if (Array.isArray(d)) for (const p of d) if (p?.type === "text") teks += p.text || ""
      } catch {}
    }
  }
  return teks.trim()
}

async function tanyaAI(uid, teks) {
  const u = stateUser(uid)
  u.history.push({ role: "user", content: teks })
  u.history = u.history.slice(-20)
  const messages = [{ role: "system", content: u.system || SYSTEM_BAWAAN }, ...u.history]
  let jawab
  try { jawab = await panggilRouter(u.model, messages) }
  catch (e) { u.history.pop(); throw e } // jangan simpan pertanyaan yg gagal
  jawab = jawab || "(jawaban kosong)"
  u.history.push({ role: "assistant", content: jawab })
  u.history = u.history.slice(-20)
  simpan()
  return jawab
}

// ---------- menu model (inline keyboard, paginasi) ----------
const PER_HAL = 8
const listAktif = new Map() // uid -> { list:[modelId], hal:number, query:string }
async function tampilModel(ctx, hal = 0, query = "") {
  const uid = ctx.from.id, chatId = ctx.chat.id
  let list = await daftarModel()
  if (query) list = list.filter(m => m.toLowerCase().includes(query.toLowerCase()))
  if (!list.length) return kirim(chatId, query ? `Tidak ada model yang cocok dengan "${query}".` : "Daftar model dari 9router kosong.")
  const totalHal = Math.ceil(list.length / PER_HAL)
  hal = Math.max(0, Math.min(hal, totalHal - 1))
  listAktif.set(uid, { list, hal, query })
  const u = stateUser(uid)
  const baris = list.slice(hal * PER_HAL, hal * PER_HAL + PER_HAL).map((m, i) => [{
    text: (m === u.model ? "✅ " : "") + m.slice(0, 60),
    callback_data: `set:${hal * PER_HAL + i}`,
  }])
  const nav = []
  if (hal > 0) nav.push({ text: "⬅️", callback_data: `pg:${hal - 1}` })
  nav.push({ text: `${hal + 1}/${totalHal}`, callback_data: "noop" })
  if (hal < totalHal - 1) nav.push({ text: "➡️", callback_data: `pg:${hal + 1}` })
  baris.push(nav)
  await kirim(chatId,
    `🧠 Model aktif: *${u.model}*\nTotal ${list.length} model${query ? ` (filter: ${query})` : ""} — ketuk untuk mengganti:`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: baris } })
}

const BANTUAN = `🤖 *Hermes* — AI melalui 9router vela1

Pesan biasa langsung dijawab AI.
Perintah:
• /model — lihat model aktif + ganti (tombol)
• /model <id> — ganti model langsung, mis. /model chatbot
• /daftar — daftar semua model (tombol, bisa dipaginasi)
• /cari <kata> — cari model, mis. /cari deepseek
• /hapus — hapus riwayat percakapan
• /sistem <teks> — ganti prompt sistem kamu
• /sistem ulang — kembalikan prompt sistem ke bawaan
• /tes — uji koneksi ke 9router
• /bantuan — bantuan ini

Alias lama tetap bisa dipakai: /help, /models, /reset, /system, /ping.`

// ---------- handler ----------
const sibuk = new Set()
async function tanganiPesan(msg) {
  const chatId = msg.chat.id, uid = msg.from?.id
  const teks = (msg.text || "").trim()
  if (!teks || uid == null) return
  if (ALLOWED.length && !ALLOWED.includes(String(uid))) return kirim(chatId, "Bot ini privat. ID kamu: " + uid)
  const u = stateUser(uid)

  if (teks === "/start" || teks === "/help" || teks === "/bantuan") return kirim(chatId, BANTUAN, { parse_mode: "Markdown" })
  if (teks === "/ping" || teks === "/tes") {
    const t0 = Date.now()
    try { const n = (await daftarModel()).length; return kirim(chatId, `✅ 9router terhubung (${Date.now() - t0}ms), ${n} model terbaca. Model aktif: ${u.model}`) }
    catch (e) { return kirim(chatId, "❌ Galat 9router: " + e.message) }
  }
  if (teks === "/reset" || teks === "/hapus") { u.history = []; simpan(); return kirim(chatId, "🧹 Riwayat percakapan dihapus.") }
  if (teks === "/model" || teks === "/models" || teks === "/daftar") return tampilModel({ from: { id: uid }, chat: { id: chatId } }).catch(e => kirim(chatId, "❌ " + e.message))
  if (teks.startsWith("/model ")) {
    const id = teks.slice(7).trim()
    if (!id) return
    u.model = id; simpan()
    return kirim(chatId, `✅ Model diganti ke: ${id}\n(Akan dipakai mulai pesan berikutnya. Cek /tes untuk memastikan id-nya tersedia.)`)
  }
  if (teks.startsWith("/cari ")) return tampilModel({ from: { id: uid }, chat: { id: chatId } }, 0, teks.slice(6).trim()).catch(e => kirim(chatId, "❌ " + e.message))
  if (teks.startsWith("/system ") || teks.startsWith("/sistem ")) {
    const isi = teks.slice(8).trim()
    if (["reset", "ulang"].includes(isi.toLowerCase())) { u.system = null; simpan(); return kirim(chatId, "✅ Prompt sistem dikembalikan ke bawaan.") }
    u.system = isi; simpan()
    return kirim(chatId, "✅ Prompt sistem kamu diganti.")
  }
  if (teks.startsWith("/")) return kirim(chatId, "Perintah tidak dikenali. Ketik /bantuan untuk daftarnya.")

  if (sibuk.has(uid)) return kirim(chatId, "⏳ Masih memproses jawaban sebelumnya, mohon tunggu sebentar…")
  sibuk.add(uid)
  try {
    await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {})
    const jawab = await tanyaAI(uid, teks)
    await kirimPanjang(chatId, jawab)
  } catch (e) {
    await kirim(chatId, "❌ Galat: " + e.message)
  } finally { sibuk.delete(uid) }
}

async function tanganiCallback(cb) {
  const uid = cb.from.id, chatId = cb.message?.chat?.id
  const data = cb.data || ""
  await tg("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {})
  if (ALLOWED.length && !ALLOWED.includes(String(uid))) return
  const sesi = listAktif.get(uid)
  if (data === "noop" || !sesi || chatId == null) return
  if (data.startsWith("pg:")) return tampilModel({ from: { id: uid }, chat: { id: chatId } }, Number(data.slice(3)), sesi.query).catch(() => {})
  if (data.startsWith("set:")) {
    const m = sesi.list[Number(data.slice(4))]
    if (!m) return
    stateUser(uid).model = m; simpan()
    return kirim(chatId, `✅ Model diganti ke: ${m}`)
  }
}

// ---------- polling ----------
async function utama() {
  const me = await tg("getMe")
  console.log(`[hermes] jalan sebagai @${me.username} — backend ${BASE_URL}, model bawaan ${MODEL_BAWAAN}`)
  await tg("setMyCommands", { commands: [
    { command: "model", description: "Ganti model AI" },
    { command: "daftar", description: "Daftar semua model" },
    { command: "cari", description: "Cari model: /cari deepseek" },
    { command: "hapus", description: "Hapus riwayat percakapan" },
    { command: "sistem", description: "Ganti prompt sistem" },
    { command: "tes", description: "Uji koneksi ke 9router" },
    { command: "bantuan", description: "Bantuan" },
  ] }).catch(() => {})
  let offset = 0
  for (;;) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] })
      for (const up of updates) {
        offset = up.update_id + 1
        if (up.message) tanganiPesan(up.message).catch(e => console.error("[pesan]", e.message))
        if (up.callback_query) tanganiCallback(up.callback_query).catch(e => console.error("[callback]", e.message))
      }
    } catch (e) {
      console.error("[polling]", e.message)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}
utama().catch(e => { console.error("[fatal]", e); process.exit(1) })
