/**
 * Markdown Table to Image Renderer for WechatSync
 *
 * 将 Markdown 表格渲染为高清晰度卡片图片，避免在 X (Twitter) 或知乎等不支持表格的平台排版错乱。
 */
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

export interface ParsedTable {
  raw: string
  headers: string[]
  alignments: string[]
  rows: string[][]
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[]

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function getChromium(): any {
  const searchDirs = [
    process.cwd(),
    path.resolve(__dirname, '..'),
    'E:/projectHome/video-uploader/x',
    'E:/projectHome/video-uploader/zhihu',
    'E:/projectHome/Wechatsync',
  ]
  for (const dir of searchDirs) {
    try {
      const resolved = require.resolve('playwright-core', { paths: [dir] })
      const mod = require(resolved)
      if (mod && mod.chromium) return mod.chromium
    } catch {}
  }
  return null
}

function parseTableCells(line: string): string[] {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s]*:?-{2,}:?[\s]*(?:\|[\s]*:?-{2,}:?[\s]*)+\|?$/.test(line.trim())
}

function parseAlignment(cell: string): string {
  const trimmed = cell.replace(/\s/g, '')
  const left = trimmed.startsWith(':')
  const right = trimmed.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  return 'left'
}

/**
 * 提取文本中的所有 Markdown 表格
 */
export function extractMarkdownTables(markdown: string): ParsedTable[] {
  const lines = markdown.split(/\r?\n/)
  const tables: ParsedTable[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(line)
      const colCount = headers.length
      const alignments = parseTableCells(lines[i + 1])
        .slice(0, colCount)
        .map(parseAlignment)
      while (alignments.length < colCount) alignments.push('left')

      const rawLines = [lines[i], lines[i + 1]]
      const rows: string[][] = []

      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        rawLines.push(lines[j])
        const cells = parseTableCells(lines[j])
        const row = cells.slice(0, colCount)
        while (row.length < colCount) row.push('')
        rows.push(row)
        j++
      }

      if (rows.length > 0) {
        tables.push({
          raw: rawLines.join('\n'),
          headers,
          alignments,
          rows,
        })
        i = j
        continue
      }
    }
    i++
  }

  return tables
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inlineFormat(text: string): string {
  let res = escapeHtml(text)
  res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  res = res.replace(/\*([^*]+?)\*/g, '<em>$1</em>')
  res = res.replace(/`([^`]+?)`/g, '<code>$1</code>')
  return res
}

/**
 * 将解析后的表格转换为美观的 HTML 模板
 */
export function tableToHtml(table: ParsedTable): string {
  const alignments = table.alignments || []
  const alignStyle = (idx: number) => {
    const a = alignments[idx] || 'left'
    return `text-align: ${a};`
  }

  const headerHtml = table.headers
    .map((h, idx) => `<th style="${alignStyle(idx)}">${inlineFormat(h)}</th>`)
    .join('')

  const rowsHtml = table.rows
    .map((row) => {
      const cells = row
        .map((c, idx) => `<td style="${alignStyle(idx)}">${inlineFormat(c)}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    display: inline-block;
  }
  .table-container {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    background: #ffffff;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 15px;
    line-height: 1.6;
    color: #334155;
  }
  th {
    background: #f8fafc;
    color: #0f172a;
    font-weight: 700;
    padding: 14px 20px;
    border-bottom: 2px solid #e2e8f0;
    white-space: nowrap;
  }
  td {
    padding: 14px 20px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: none;
  }
  tr:nth-child(even) td {
    background: #fafbfc;
  }
  strong {
    color: #0f172a;
    font-weight: 600;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    color: #0284c7;
  }
</style>
</head>
<body>
  <div class="table-container">
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</body>
</html>`
}

/**
 * 渲染单个表格为高清卡片图片
 */
export async function renderTableToImage(
  table: ParsedTable,
  outputPath: string,
  scale = 2
): Promise<boolean> {
  const chromePath = findChrome()
  if (!chromePath) {
    throw new Error('未找到 Google Chrome 可执行文件，无法渲染表格图片')
  }

  const html = tableToHtml(table)
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const chromium = getChromium()
  if (chromium) {
    const browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--disable-gpu', '--hide-scrollbars'],
    })
    try {
      const page = await browser.newPage({
        deviceScaleFactor: scale,
        viewport: { width: 1400, height: 900 },
      })
      await page.setContent(html, { waitUntil: 'domcontentloaded' })
      const el = page.locator('.table-container')
      await el.screenshot({ path: outputPath, type: 'png' })
      return true
    } finally {
      await browser.close().catch(() => {})
    }
  }

  // 回退到 Chrome 命令行 headless 渲染
  const tempHtml = outputPath.replace(/\.png$/i, '.tmp.html')
  fs.writeFileSync(tempHtml, html, 'utf8')
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        chromePath,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          `--force-device-scale-factor=${scale}`,
          `--screenshot=${outputPath}`,
          '--window-size=1400,900',
          tempHtml,
        ],
        { stdio: 'ignore' }
      )
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Chrome screenshot exited with code ${code}`))
      })
      proc.on('error', reject)
    })
    return true
  } finally {
    if (fs.existsSync(tempHtml)) {
      fs.unlinkSync(tempHtml)
    }
  }
}

/**
 * 自动扫描 Markdown 内容并将表格替换为本地卡片图片
 */
export async function convertTablesToImages(
  markdown: string,
  articleFilePath: string
): Promise<{ content: string; renderedCount: number }> {
  const tables = extractMarkdownTables(markdown)
  if (tables.length === 0) {
    return { content: markdown, renderedCount: 0 }
  }

  const fileDir = path.dirname(articleFilePath)
  const articleBaseName = path.basename(articleFilePath, path.extname(articleFilePath))
  const imagesDir = path.join(fileDir, 'images', articleBaseName)

  let updatedContent = markdown
  let renderedCount = 0

  for (let idx = 0; idx < tables.length; idx++) {
    const table = tables[idx]
    const imgFileName = `table_${String(idx + 1).padStart(2, '0')}.png`
    const imgFullPath = path.join(imagesDir, imgFileName)
    const relImgPath = `images/${articleBaseName}/${imgFileName}`

    await renderTableToImage(table, imgFullPath, 2)
    renderedCount++

    const replacement = `![表格 ${idx + 1}](${relImgPath})`
    updatedContent = updatedContent.replace(table.raw, replacement)
  }

  return {
    content: updatedContent,
    renderedCount,
  }
}
