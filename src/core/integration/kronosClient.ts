export type KronosInterval = 'day' | '1minute' | '5minute' | '15minute' | '30minute';

export interface KronosForecastRequest {
  instrumentKey: string;
  interval: KronosInterval;
  lookback: number;
  forecastHorizon: number;
}

export interface KronosForecastPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface KronosForecastSuccess {
  status: 'success';
  instrumentKey: string;
  interval: KronosInterval;
  model: string;
  source: string;
  lookback: number;
  forecastHorizon: number;
  forecast: KronosForecastPoint[];
}

export interface KronosForecastError {
  status: 'error';
  error: string;
}

export type KronosForecastResult = KronosForecastSuccess | KronosForecastError;

const KRONOS_INTERVALS: KronosInterval[] = ['day', '1minute', '5minute', '15minute', '30minute'];
const DEFAULT_INTERVAL: KronosInterval = 'day';
const DEFAULT_LOOKBACK = 120;
const DEFAULT_FORECAST_HORIZON = 5;
const REQUEST_TIMEOUT_MS = 10_000;

function getEnvironmentValue(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const value = import.meta.env[key] as string | undefined;
    if (value?.trim()) return value.trim();
  }

  if (typeof process !== 'undefined') {
    const value = key === 'KRONOS_API_URL'
      ? process.env.KRONOS_API_URL
      : process.env.KRONOS_INTERNAL_API_KEY;
    if (value?.trim()) return value.trim();
  }

  return undefined;
}

function getEndpoint(): string {
  const baseUrl = getEnvironmentValue('KRONOS_API_URL') || 'http://127.0.0.1:7070';
  return `${baseUrl.replace(/\/+$/, '')}/api/kronos/forecast`;
}

function isFiniteIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseForecastPoint(value: unknown): KronosForecastPoint | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  const numericFields = ['open', 'high', 'low', 'close', 'volume', 'amount'];
  if (typeof point.timestamp !== 'string' || numericFields.some(field => typeof point[field] !== 'number' || !Number.isFinite(point[field]))) {
    return null;
  }

  return {
    timestamp: point.timestamp,
    open: point.open as number,
    high: point.high as number,
    low: point.low as number,
    close: point.close as number,
    volume: point.volume as number,
    amount: point.amount as number,
  };
}

function parseSuccess(value: unknown): KronosForecastSuccess | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (payload.status !== 'success'
    || typeof payload.instrument_key !== 'string'
    || !KRONOS_INTERVALS.includes(payload.interval as KronosInterval)
    || typeof payload.model !== 'string'
    || typeof payload.source !== 'string'
    || !isFiniteIntegerInRange(payload.lookback, 1, 512)
    || !isFiniteIntegerInRange(payload.forecast_horizon, 1, 128)
    || !Array.isArray(payload.forecast)) {
    return null;
  }

  const forecast = payload.forecast.map(parseForecastPoint);
  if (forecast.some(point => point === null)) return null;

  return {
    status: 'success',
    instrumentKey: payload.instrument_key,
    interval: payload.interval as KronosInterval,
    model: payload.model,
    source: payload.source,
    lookback: payload.lookback,
    forecastHorizon: payload.forecast_horizon,
    forecast: forecast as KronosForecastPoint[],
  };
}

function parseError(value: unknown): KronosForecastError | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  return payload.status === 'error' && typeof payload.error === 'string' && payload.error.trim()
    ? { status: 'error', error: payload.error.trim() }
    : null;
}

export async function forecastWithKronos(request: KronosForecastRequest): Promise<KronosForecastResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const internalApiKey = getEnvironmentValue('KRONOS_INTERNAL_API_KEY');

  if (internalApiKey) headers['X-Internal-API-Key'] = internalApiKey;

  try {
    const response = await fetch(getEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instrument_key: request.instrumentKey,
        interval: request.interval,
        lookback: request.lookback,
        forecast_horizon: request.forecastHorizon,
      }),
      signal: controller.signal,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: 'error', error: 'Kronos forecast request failed.' };
    }

    if (!response.ok) {
      const error = parseError(payload);
      return error || { status: 'error', error: 'Kronos forecast request failed.' };
    }

    const success = parseSuccess(payload);
    if (success) return success;

    const error = parseError(payload);
    return error || { status: 'error', error: 'Kronos forecast request failed.' };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'error', error: 'Kronos forecast timed out.' };
    }
    return { status: 'error', error: 'Kronos service unavailable.' };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateKronosForecastArgs(args: Record<string, unknown>): KronosForecastRequest | KronosForecastError {
  const instrumentKey = typeof args.instrument_key === 'string' ? args.instrument_key.trim() : '';
  const interval = args.interval === undefined ? DEFAULT_INTERVAL : args.interval;
  const lookback = args.lookback === undefined ? DEFAULT_LOOKBACK : args.lookback;
  const forecastHorizon = args.forecast_horizon === undefined ? DEFAULT_FORECAST_HORIZON : args.forecast_horizon;

  if (!instrumentKey) return { status: 'error', error: 'Instrument key required for Kronos forecast.' };
  if (typeof interval !== 'string' || !KRONOS_INTERVALS.includes(interval as KronosInterval)) {
    return { status: 'error', error: 'Invalid Kronos forecast interval.' };
  }
  if (!isFiniteIntegerInRange(lookback, 1, 512)) {
    return { status: 'error', error: 'Invalid Kronos forecast lookback.' };
  }
  if (!isFiniteIntegerInRange(forecastHorizon, 1, 128)) {
    return { status: 'error', error: 'Invalid Kronos forecast horizon.' };
  }

  return {
    instrumentKey,
    interval: interval as KronosInterval,
    lookback,
    forecastHorizon,
  };
}
