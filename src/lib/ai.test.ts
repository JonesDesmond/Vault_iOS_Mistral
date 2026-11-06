import { describe, it, expect } from 'vitest';
import { buildRequest, extractText, parseAIResponse, type AISettings } from './ai';

const baseCfg = (over: Partial<AISettings>): AISettings => ({
  enabled: true, provider: 'openai', model: '', apiKey: 'sk-test', baseUrl: '', localMode: 'ollama', ...over
});

describe('buildRequest per provider', () => {
  it('OpenAI / ChatGPT: bearer key, chat completions, image_url data URL', () => {
    const r = buildRequest(baseCfg({ provider: 'openai' }), 'image/jpeg', 'QUJD', 'prompt');
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(r.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,QUJD');
    expect(body.messages[0].content[0].text).toBe('prompt');
  });

  it('Mistral: api.mistral.ai with mistral-small-latest default', () => {
    const r = buildRequest(baseCfg({ provider: 'mistral' }), 'image/jpeg', 'QUJD');
    expect(r.url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(JSON.parse(r.body).model).toBe('mistral-small-latest');
  });

  it('Anthropic / Claude: x-api-key header, base64 image source block', () => {
    const r = buildRequest(baseCfg({ provider: 'anthropic' }), 'image/png', 'QUJD');
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.headers['x-api-key']).toBe('sk-test');
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    const c = JSON.parse(r.body).messages[0].content;
    expect(c[0].type).toBe('image');
    expect(c[0].source).toEqual({ type: 'base64', media_type: 'image/png', data: 'QUJD' });
  });

  it('Gemini: model in URL, API key as query param, inline_data part', () => {
    const r = buildRequest(baseCfg({ provider: 'gemini', model: 'gemini-2.0-flash' }), 'image/jpeg', 'QUJD');
    expect(r.url).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
    expect(r.url).toContain('key=sk-test');
    expect(JSON.parse(r.body).contents[0].parts[1].inline_data.data).toBe('QUJD');
  });

  it('local Ollama: /api/chat on the user base URL, images array, no auth', () => {
    const r = buildRequest(baseCfg({ provider: 'local', localMode: 'ollama', baseUrl: 'http://192.168.1.10:11434/', model: 'llava' }), 'image/jpeg', 'QUJD');
    expect(r.url).toBe('http://192.168.1.10:11434/api/chat');
    expect(r.headers.Authorization).toBeUndefined();
    const body = JSON.parse(r.body);
    expect(body.stream).toBe(false);
    expect(body.messages[0].images).toEqual(['QUJD']);
  });

  it('local LM Studio (openai-compatible): appends /v1/chat/completions, no key needed', () => {
    const r = buildRequest(baseCfg({ provider: 'local', localMode: 'openai-compat', baseUrl: 'http://localhost:1234', apiKey: '' }), 'image/jpeg', 'QUJD');
    expect(r.url).toBe('http://localhost:1234/v1/chat/completions');
    expect(r.headers.Authorization).toBeUndefined();
  });
});

describe('extractText per provider', () => {
  it('reads each provider response shape', () => {
    expect(extractText(baseCfg({ provider: 'openai' }), JSON.stringify({ choices: [{ message: { content: 'hi' } }] }))).toBe('hi');
    expect(extractText(baseCfg({ provider: 'anthropic' }), JSON.stringify({ content: [{ text: 'a' }, { text: 'b' }] }))).toBe('a\nb');
    expect(extractText(baseCfg({ provider: 'gemini' }), JSON.stringify({ candidates: [{ content: { parts: [{ text: 'g' }] } }] }))).toBe('g');
    expect(extractText(baseCfg({ provider: 'local', localMode: 'ollama' }), JSON.stringify({ message: { content: 'o' } }))).toBe('o');
  });
});

describe('parseAIResponse', () => {
  it('extracts strict JSON even inside markdown fences', () => {
    const r = parseAIResponse('```json\n{"store":"REWE","date":"2025-03-05","total":15.17,"currency":"EUR"}\n```');
    expect(r).toEqual({ store: 'REWE', date: '2025-03-05', total: 15.17, currency: 'EUR' });
  });

  it('falls back to plain receipt parsing when no JSON', () => {
    const r = parseAIResponse('SUMME EUR 15,17\nDatum 05.03.2025');
    expect(r.total).toBe(15.17);
    expect(r.date).toBe('2025-03-05');
  });

  it('falls back to plain text parsing when JSON fields are invalid', () => {
    const r = parseAIResponse('{"store":null,"date":"05.03.2025","total":"15,17","currency":"EURO"}');
    expect(r.store).toBeUndefined();
    expect(r.currency).toBe('EUR'); // "EURO" in the raw text still maps to EUR
    expect(r.date).toBe('2025-03-05');
    expect(r.total).toBeUndefined(); // the only digit run is the date, not an amount
  });
});
