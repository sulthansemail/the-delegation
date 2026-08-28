export interface OHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataset {
  symbol: string;
  candles: OHLCV[];
}

function parseNumber(
  value: string,
  field: string,
  lineNumber: number
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid ${field} at CSV line ${lineNumber}: ${value}`
    );
  }

  return parsed;
}

function parseCSVLine(
  line: string,
  lineNumber: number
): OHLCV {
  const columns = line.split(',');

  if (columns.length !== 6) {
    throw new Error(
      `Expected 6 columns at CSV line ${lineNumber}, found ${columns.length}.`
    );
  }

  const [
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  ] = columns.map((value) => value.trim());

  if (!timestamp) {
    throw new Error(
      `Missing timestamp at CSV line ${lineNumber}.`
    );
  }

  const candle: OHLCV = {
    timestamp,
    open: parseNumber(open, 'open', lineNumber),
    high: parseNumber(high, 'high', lineNumber),
    low: parseNumber(low, 'low', lineNumber),
    close: parseNumber(close, 'close', lineNumber),
    volume: parseNumber(volume, 'volume', lineNumber),
  };

  if (candle.high < candle.low) {
    throw new Error(
      `High is lower than low at CSV line ${lineNumber}.`
    );
  }

  if (
    candle.open < candle.low ||
    candle.open > candle.high
  ) {
    throw new Error(
      `Open is outside high/low range at CSV line ${lineNumber}.`
    );
  }

  if (
    candle.close < candle.low ||
    candle.close > candle.high
  ) {
    throw new Error(
      `Close is outside high/low range at CSV line ${lineNumber}.`
    );
  }

  if (candle.volume < 0) {
    throw new Error(
      `Negative volume at CSV line ${lineNumber}.`
    );
  }

  return candle;
}

export function parseOHLCVCSV(
  csv: string,
  symbol: string
): MarketDataset {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(
      'OHLCV CSV does not contain any data rows.'
    );
  }

  const header = lines[0]
    .split(',')
    .map((column) => column.trim().toLowerCase());

  const expectedHeader = [
    'timestamps',
    'open',
    'high',
    'low',
    'close',
    'volume',
  ];

  if (
    header.length !== expectedHeader.length ||
    !header.every(
      (column, index) =>
        column === expectedHeader[index]
    )
  ) {
    throw new Error(
      `Unexpected OHLCV header. Expected: ${expectedHeader.join(',')}`
    );
  }

  const candles = lines
    .slice(1)
    .map((line, index) =>
      parseCSVLine(line, index + 2)
    );

  for (let i = 1; i < candles.length; i++) {
    const previous = new Date(
      candles[i - 1].timestamp
    ).getTime();

    const current = new Date(
      candles[i].timestamp
    ).getTime();

    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current)
    ) {
      throw new Error(
        `Invalid timestamp around CSV line ${i + 2}.`
      );
    }

    if (current <= previous) {
      throw new Error(
        `OHLCV timestamps are not strictly increasing around CSV line ${i + 2}.`
      );
    }
  }

  return {
    symbol: symbol.trim().toUpperCase(),
    candles,
  };
}