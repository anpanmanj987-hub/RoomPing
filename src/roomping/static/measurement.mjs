import {LIMITS, median, transferRate} from './metrics.mjs';

/** Sequential bounded HTTP measurements. Every returned sample is complete. */
export class MeasurementClient {
  constructor({baseUrl = '', token, timeoutMs = 15000}) {
    this.baseUrl = baseUrl; this.token = token; this.timeoutMs = timeoutMs;
    this.busy = false; this.runId = null;
  }
  async request(path, {method = 'GET', body, signal, consume = r => r.json(), timeoutMs = this.timeoutMs} = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(new Error('通信が時間切れになりました')), timeoutMs);
    try {
      const headers = {'X-RoomPing-Token': this.token};
      if (this.runId) headers['X-RoomPing-Run'] = this.runId;
      if (body instanceof Blob || body instanceof Uint8Array) headers['Content-Type'] = 'application/octet-stream';
      const response = await fetch(this.baseUrl + path, {method, body, headers, signal: controller.signal,
        // Default CORS mode keeps POST Origin intact under no-referrer policy.
        // All production paths remain relative to this host; server CORS stays closed.
        cache: 'no-store', credentials: 'omit'});
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${error.error || '通信に失敗しました'}`);
      }
      return await consume(response);
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
    }
  }
  async measure({bytes = 4 * 1024 * 1024, repeats = 3, latencyCount = 7, signal, onProgress = () => {}} = {}) {
    if (this.busy) throw new Error('この画面で測定中です');
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > LIMITS.transferBytes || !Number.isInteger(repeats) || repeats < 1 || repeats > 3 ||
        !Number.isInteger(latencyCount) || latencyCount < 1 || latencyCount > LIMITS.samples) throw new Error('測定設定が範囲外です');
    this.busy = true;
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason || new Error('測定を中断しました'));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(new Error('測定全体が時間切れになりました')), 120000);
    const runSignal = controller.signal;
    const progress = (phase, current, total) => onProgress({phase, current, total});
    // Prepared before timing; bounded, known-length body works on HTTP/1.x.
    const payload = new Uint8Array(bytes);
    for (let offset = 0; offset < bytes; offset += 65536) crypto.getRandomValues(payload.subarray(offset, Math.min(bytes, offset + 65536)));
    const uploadBody = new Blob([payload]);
    try {
      const started = await this.request('/api/run/start', {method:'POST', body:'', signal:runSignal});
      if (typeof started.runId !== 'string' || !started.runId || started.runId.length > 100) throw new Error('測定開始応答が不正です');
      this.runId = started.runId;
      progress('warmup', 0, 1);
      await this.request(`/api/ping?nonce=${Date.now()}_warmup`, {signal:runSignal});
      const latencyMs = [], download = [], upload = [];
      for (let i = 0; i < latencyCount; i++) {
        progress('latency', i + 1, latencyCount);
        const start = performance.now();
        const response = await this.request(`/api/ping?nonce=${Date.now()}_${i}`, {signal:runSignal});
        const duration = performance.now() - start;
        if (response.ok !== true) throw new Error('往復応答が不正です');
        latencyMs.push(duration);
      }
      median(latencyMs);
      for (let i = 0; i < repeats; i++) {
        progress('download', i + 1, repeats);
        const start = performance.now();
        const received = await this.request(`/api/download?bytes=${bytes}&nonce=${Date.now()}_${i}`, {
          signal:runSignal, consume: async response => {
            if (Number(response.headers.get('Content-Length')) !== bytes || response.headers.get('Content-Encoding')) throw new Error('ダウンロードの形式が不正です');
            if (!response.body) throw new Error('ダウンロード本文がありません');
            const reader = response.body.getReader(); let count = 0;
            try {
              for (;;) {
                const {value, done} = await reader.read();
                if (done) break;
                count += value.byteLength;
                if (count > bytes) { await reader.cancel(); throw new Error('受信バイト数が上限を超えました'); }
              }
            } finally { reader.releaseLock(); }
            return count;
          }});
        const durationMs = performance.now() - start;
        if (received !== bytes) throw new Error('ダウンロードの受信バイト数が一致しません');
        download.push({bytes: received, durationMs});
      }
      for (let i = 0; i < repeats; i++) {
        progress('upload', i + 1, repeats);
        const start = performance.now();
        const acknowledgement = await this.request('/api/upload', {method:'POST', body:uploadBody, signal:runSignal});
        const durationMs = performance.now() - start;
        if (acknowledgement.receivedBytes !== bytes) throw new Error('アップロードの受信バイト数が一致しません');
        upload.push({bytes: acknowledgement.receivedBytes, durationMs});
      }
      transferRate(download); transferRate(upload);
      if (runSignal.aborted) throw runSignal.reason;
      return {latencyMs, download, upload};
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (this.runId) await this.request('/api/run/end', {method:'POST', body:'', timeoutMs:2000}).catch(() => {});
      this.runId = null; this.busy = false;
    }
  }
}
