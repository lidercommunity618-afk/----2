import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Candle } from '@/types/domain';

vi.mock('../server-clock', () => ({
  serverClock: { now: () => Date.now() },
}));

vi.mock('../providers.config', () => ({
  buildDerivWsUrl: () => 'wss://mock.deriv.com?app_id=test',
  PROVIDERS_CONFIG: {
    deriv: {
      wsUrl: 'wss://mock.deriv.com',
      appId: 'test',
      granularityMap: { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 },
      reconnectBackoffMs: [3000, 6000, 12000, 30000, 60000],
      pingIntervalMs: 15000,
      requestTimeoutMs: 10000,
      defaultHistory: 1000,
    },
  },
}));

vi.mock('../symbols', () => ({
  mapSymbolForDeriv: (s: string) => s,
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static last(): MockWebSocket { return MockWebSocket.instances[MockWebSocket.instances.length - 1]; }

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: string, cb: (...args: never[]) => void) {
    if (event === 'open') this.onopen = cb as () => void;
    if (event === 'error') this.onerror = cb as () => void;
    if (event === 'close') this.onclose = cb as () => void;
  }

  removeEventListener() {}

  send(data: string) { this.sent.push(data); }

  close() { this.readyState = 3; this.onclose?.(); }

  fireOpen() { this.readyState = 1; this.onopen?.(); }

  fireMessage(obj: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

import { DerivSource } from './deriv';

describe('DerivSource fallback polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes fetchHistory via fallback polling after connect and timer advance', async () => {
    const source = new DerivSource();
    const fetchSpy = vi.spyOn(source, 'fetchHistory').mockResolvedValue([
      { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 } as Candle,
    ]);

    const connectPromise = source.connect('R_100', '1m');
    const ws = MockWebSocket.last();
    ws.fireOpen();

    ws.fireMessage({ req_id: 1, candles: [{ epoch: 100, open: 1, high: 2, low: 0.5, close: 1.5 }] });

    await connectPromise;

    const initialCalls = fetchSpy.mock.calls.length;

    vi.advanceTimersByTime(10_000);

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls);

    source.disconnect();
  });
});
