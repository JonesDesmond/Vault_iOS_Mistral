// OPTIONAL AI receipt scanning. OFF by default. When the user explicitly enables it,
// the photo is sent ONLY to the provider endpoint they configured (or their own local
// server). This module is the ONLY place in the app that builds an absolute (external)
// URL — everything else in the app is same-origin / on-device.

import type { ParsedReceipt } from '../types';
import { parseReceiptText } from './receipt';

export type AIProvider = 'mistral' | 'openai' | 'anthropic' | 'gemini' | 'local';
export type LocalMode = 'ollama' | 'openai-compat';

export interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl: string;     // only used for provider 'local'
  localMode: LocalMode; // ollama (default) or openai-compatible (LM Studio etc.)
}

export const AI_PROVIDERS: { id: AIProvider; label: string; defaultModel: string; hint: string }[] = [
  { id: 'mistral', label: 'Mistral AI', defaultModel: 'pixtral-12b-2409', hint: 'API key from console.mistral.ai — sent to api.mistral.ai' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', defaultModel: 'gpt-4o-mini', hint: 'API key from platform.openai.com — sent to api.openai.com' },
  { id: 'anthropic', label: 'Claude (Anthropic)', defaultModel: 'claude-3-5-sonnet-latest', hint: 'API key from console.anthropic.com — sent to api.anthropic.com' },
  { id: 'gemini', label: 'Gemini (Google)', defaultModel: 'gemini-1.5-flash', hint: 'API key from aistudio.google.com — sent to generativelanguage.googleapis.com' },
  { id: 'local', label: 'My local AI server (Ollama / LM Studio / …)', defaultModel: 'llava', hint: 'e.g. http://192.168.1.10:11434 (Ollama) or http://localhost:1234 (LM Studio). Stays on your own network.' }
];

export const SCAN_PROMPT = `You are reading a receipt photo. Extract the data and answer with STRICT JSON only, no markdown, no explanation:
{"store": string|null, "date": "YYYY-MM-DD"|null, "total": number|null, "currency": "EUR"|"USD"|...|null}
Rules: the total is the final payable amount (SUMME/Gesamt/Total) — never VAT (MWSt/USt), subtotal or change. Dates are day-first European (DD.MM.YYYY). total is a number with a dot as decimal separator. If unsure, use null.`;

export interface AIRequest { url: string; headers: Record<string, string>; body: string; }

const dataUrl = (mime: string, b64: string) => `data:${mime};base64,${b64}`;

export function buildRequest(cfg: AISettings, mime: string, imageB64: string, prompt = SCAN_PROMPT): AIRequest {
  const p = cfg.provider;
  if (p === 'openai' || (p === 'local' && cfg.localMode === 'openai-compat')) {
    const base = (cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const url = p === 'local' ? (base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`) : `${base}/v1/chat/completions`;
    return {
      url,
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        max_tokens: 400,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl(mime, imageB64) } }
        ] }]
      })
    };
  }
  if (p === 'mistral') {
    return {
      url: 'https://api.mistral.ai/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'pixtral-12b-2409',
        max_tokens: 400,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl(mime, imageB64) } }
        ] }]
      })
    };
  }
  if (p === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.model || 'claude-3-5-sonnet-latest',
        max_tokens: 400,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imageB64 } },
          { type: 'text', text: prompt }
        ] }]
      })
    };
  }
  if (p === 'gemini') {
    const model = cfg.model || 'gemini-1.5-flash';
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [ { text: prompt }, { inline_data: { mime_type: mime, data: imageB64 } } ] }]
      })
    };
  }
  // local ollama
  const base = (cfg.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  return {
    url: `${base}/api/chat`,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model || 'llava',
      stream: false,
      messages: [{ role: 'user', content: prompt, images: [imageB64] }]
    })
  };
}

/** Pull the assistant's text out of each provider's response JSON. */
export function extractText(cfg: AISettings, responseJson: string): string {
  const j = JSON.parse(responseJson);
  const p = cfg.provider;
  if (p === 'anthropic') return (j.content ?? []).map((c: any) => c.text ?? '').join('\n');
  if (p === 'gemini') return (j.candidates?.[0]?.content?.parts ?? []).map((x: any) => x.text ?? '').join('\n');
  if (p === 'local' && cfg.localMode === 'ollama') return j.message?.content ?? '';
  return j.choices?.[0]?.message?.content ?? '';
}

/** Parse the AI's answer into a ParsedReceipt; falls back to plain receipt-text parsing. */
export function parseAIResponse(text: string): ParsedReceipt {
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > start) {
      try {
        const j = JSON.parse(text.slice(start, end + 1));
        const out: ParsedReceipt = {};
        if (typeof j.store === 'string' && j.store.trim()) out.store = j.store.trim().slice(0, 48);
        if (typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date)) out.date = j.date;
        if (typeof j.total === 'number' && Number.isFinite(j.total)) out.total = Math.round(j.total * 100) / 100;
        if (typeof j.currency === 'string' && /^[A-Z]{3}$/.test(j.currency)) out.currency = j.currency;
        if (out.total != null || out.store || out.date) return out;
      } catch { /* fall through */ }
    }
  }
  return parseReceiptText(text);
}

export async function callVisionAI(cfg: AISettings, mime: string, imageB64: string): Promise<ParsedReceipt> {
  const req = buildRequest(cfg, mime, imageB64);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`AI provider answered ${res.status}${detail ? ': ' + detail : ''}`);
    }
    return parseAIResponse(extractText(cfg, await res.text()));
  } finally {
    clearTimeout(timer);
  }
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
