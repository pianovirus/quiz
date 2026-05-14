import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, 'src/data')
const IMG_ROOT = path.resolve(__dirname, 'public/q-images')

function adminEndpoints() {
  const isYear = (s) => /^\d{4}$/.test(s)
  const json = (res, status, obj) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  }
  const readBody = (req) => new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (c) => body += c)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })

  return {
    name: 'quiz-admin-endpoints',
    configureServer(server) {

      // 데이터 파일 목록
      server.middlewares.use('/__list-data', (req, res) => {
        try {
          const files = fs.existsSync(DATA_DIR)
            ? fs.readdirSync(DATA_DIR).filter(f => /^\d{4}\.js$/.test(f)).sort()
            : []
          json(res, 200, { files })
        } catch (err) { json(res, 500, { error: err.message }) }
      })

      // 데이터 파일 읽기
      server.middlewares.use('/__read-data', (req, res) => {
        try {
          const url = new URL(req.url, 'http://x')
          const filename = url.searchParams.get('file') || ''
          if (!/^\d{4}\.js$/.test(filename)) return json(res, 400, { error: 'invalid filename' })
          const target = path.join(DATA_DIR, filename)
          if (!fs.existsSync(target)) return json(res, 404, { error: 'not found' })
          json(res, 200, { content: fs.readFileSync(target, 'utf8') })
        } catch (err) { json(res, 500, { error: err.message }) }
      })

      // 데이터 파일 저장
      server.middlewares.use('/__save-data', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
        try {
          const { filename, content } = JSON.parse(await readBody(req))
          if (!/^\d{4}\.js$/.test(filename)) return json(res, 400, { error: 'invalid filename' })
          if (typeof content !== 'string') return json(res, 400, { error: 'content must be string' })
          fs.mkdirSync(DATA_DIR, { recursive: true })
          const target = path.join(DATA_DIR, filename)
          fs.writeFileSync(target, content, 'utf8')
          json(res, 200, { ok: true, path: target, bytes: Buffer.byteLength(content, 'utf8') })
        } catch (err) { json(res, 500, { error: err.message }) }
      })

      // 이미지 저장 (data URL → public/q-images/YYYY/Q{id}.png 또는 Q{id}-expl.png)
      server.middlewares.use('/__save-image', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
        try {
          const { year, id, dataUrl, kind = 'question' } = JSON.parse(await readBody(req))
          if (!isYear(year)) return json(res, 400, { error: 'invalid year' })
          if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'invalid id' })
          if (kind !== 'question' && kind !== 'explanation') {
            return json(res, 400, { error: 'kind must be question|explanation' })
          }
          const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl || '')
          if (!m) return json(res, 400, { error: 'invalid dataUrl (png/jpeg/webp only)' })
          const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
          const buf = Buffer.from(m[2], 'base64')
          const dir = path.join(IMG_ROOT, year)
          fs.mkdirSync(dir, { recursive: true })
          const baseName = kind === 'explanation' ? `Q${id}-expl` : `Q${id}`
          // 기존 파일이 다른 확장자로 있을 수 있으니 우선 삭제
          for (const e of ['png','jpg','webp']) {
            const old = path.join(dir, `${baseName}.${e}`)
            if (fs.existsSync(old)) fs.unlinkSync(old)
          }
          const target = path.join(dir, `${baseName}.${ext}`)
          fs.writeFileSync(target, buf)
          json(res, 200, {
            ok: true,
            url: `/q-images/${year}/${baseName}.${ext}`,
            bytes: buf.length,
          })
        } catch (err) { json(res, 500, { error: err.message }) }
      })

      // 이미지 삭제 (kind 미지정 시 문제+해설 모두 삭제)
      server.middlewares.use('/__delete-image', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
        try {
          const { year, id, kind } = JSON.parse(await readBody(req))
          if (!isYear(year)) return json(res, 400, { error: 'invalid year' })
          let removed = []
          const targets = []
          if (!kind || kind === 'question') targets.push(`Q${id}`)
          if (!kind || kind === 'explanation') targets.push(`Q${id}-expl`)
          for (const base of targets) {
            for (const e of ['png','jpg','webp']) {
              const f = path.join(IMG_ROOT, year, `${base}.${e}`)
              if (fs.existsSync(f)) { fs.unlinkSync(f); removed.push(f) }
            }
          }
          json(res, 200, { ok: true, removed })
        } catch (err) { json(res, 500, { error: err.message }) }
      })

    },
  }
}

export default defineConfig({
  plugins: [react(), adminEndpoints()],
  server: {
    port: 7700,
    open: true,
  },
})
