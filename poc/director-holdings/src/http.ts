// src/http.ts
// 用法：npx tsx src/http.ts <url> <outFile> [method] [body]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function fetchText(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<{ status: number; contentType: string; text: string }> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: {
      'User-Agent': 'Mozilla/5.0 (poc director-holdings)',
      ...(init?.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...init?.headers,
    },
  });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text: await res.text() };
}

/** 防呆：擋下把錯誤頁/HTML 當成資料存檔（data.gov.tw 轉址至 mopsfin 可能回傳安全性錯誤頁）。
 *  CSV/JSON 來源應套用；MOPS 本身回傳 HTML，須以 ALLOW_HTML=1 放行（錯誤頁改由解析器偵測）。 */
export function assertNotHtml(text: string, url: string): void {
  const head = text.slice(0, 500).toLowerCase();
  if (head.includes('<html') || head.includes('<!doctype html')) {
    throw new Error(`回應疑似 HTML/錯誤頁而非資料：${url}\n前 500 字：\n${text.slice(0, 500)}`);
  }
}

// 直接從命令列執行：抓一個 URL 存成 fixture（自動建立目錄；預設擋 HTML 錯誤頁，ALLOW_HTML=1 放行）
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, method, body] = process.argv.slice(2);
  const { status, contentType, text } = await fetchText(url, { method, body });
  console.log('HTTP', status, 'content-type', contentType, 'bytes', text.length);
  if (out) {
    if (!process.env.ALLOW_HTML) assertNotHtml(text, url);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text);
    console.log('saved to', out);
  } else {
    console.log(text.slice(0, 2000));
  }
}
