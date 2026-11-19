// Tes koneksi ke 9router TANPA Telegram: /models + 1 completion pakai model bawaan,
// lalu 1 completion pakai model hasil "ganti" (simulasi /model dari bot).
import { readFileSync, existsSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
const DIR = path.dirname(fileURLToPath(import.meta.url))
if (existsSync(path.join(DIR, ".env"))) for (const b of readFileSync(path.join(DIR, ".env"), "utf8").split("\n")) {
  const m = b.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:20128/v1").replace(/\/$/, "")
const KEY = process.env.AI_API_KEY || ""
const H = { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) }

const r = await fetch(`${BASE}/models`, { headers: H })
if (!r.ok) { console.error("GAGAL /models HTTP", r.status); process.exit(1) }
const models = (await r.json()).data.map(d => d.id)
console.log(`OK /models: ${models.length} model. Contoh: ${models.slice(0, 5).join(", ")}`)

async function completion(model) {
  const r = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: H, body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: "Jawab singkat: 1+1 berapa?" }] }) })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`)
  if ((r.headers.get("content-type") || "").includes("application/json")) return (await r.json()).choices?.[0]?.message?.content?.trim() || ""
  let teks = "", buf = ""
  const reader = r.body.getReader(), dec = new TextDecoder()
  for (;;) { const { done, value } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true }); let i
    while ((i = buf.indexOf("\n")) >= 0) { const b = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!b.startsWith("data:")) continue; const d = b.slice(5).trim(); if (d === "[DONE]") continue
      try { const c = JSON.parse(d).choices?.[0]?.delta?.content; if (typeof c === "string") teks += c } catch {} } }
  return teks.trim()
}
for (const model of [process.env.DEFAULT_MODEL || "chatbot", "coa/deepseek-v4-1-flash-1017"]) {
  const t0 = Date.now()
  let jawab
  try { jawab = await completion(model) } catch (e) { console.error(`GAGAL completion [${model}]:`, e.message); process.exit(1) }
  if (!jawab) { console.error(`GAGAL completion [${model}]: jawaban kosong`); process.exit(1) }
  console.log(`OK completion [${model}] (${Date.now() - t0}ms): ${jawab.slice(0, 80)}`)
}
console.log("TES ROUTER LULUS — jalur bot -> 9router -> model (termasuk ganti model) jalan.")
