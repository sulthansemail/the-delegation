#!/usr/bin/env python3

import sys
from pathlib import Path

import yfinance as yf
import pandas as pd


def fetch_historical_data(symbol: str, period: str = "5y", interval: str = "1d"):
    symbol = symbol.strip().upper()

    if not symbol:
        raise ValueError("Stock symbol cannot be empty.")

    # NSE symbols generally need .NS for Yahoo Finance.
    yf_symbol = symbol if "." in symbol else f"{symbol}.NS"

    print(f"Downloading historical data for {yf_symbol}...")
    print(f"Period: {period}")
    print(f"Interval: {interval}")
    print()

    df = yf.download(
        yf_symbol,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
    )

    if df.empty:
        raise RuntimeError(
            f"No historical data returned for {yf_symbol}."
        )

    # yfinance can return MultiIndex columns depending on the version
    # and request. Flatten them if necessary.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Normalize Yahoo Finance column names.
    df = df.rename(
        columns={
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        }
    )

    required_columns = [
        "open",
        "high",
        "low",
        "close",
        "volume",
    ]

    missing = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing:
        raise RuntimeError(
            f"Missing required OHLCV columns: {missing}"
        )

    # Convert the index into timestamps.
    df = df.reset_index()

    date_column = "Date" if "Date" in df.columns else "Datetime"

    if date_column not in df.columns:
        raise RuntimeError(
            "Could not find Date/Datetime column in yfinance result."
        )

    df = df.rename(columns={date_column: "timestamps"})

    # Keep only the data Kronos/Delegation needs.
    df = df[
        [
            "timestamps",
            "open",
            "high",
            "low",
            "close",
            "volume",
        ]
    ]

    # Normalize timestamp format.
    df["timestamps"] = pd.to_datetime(
        df["timestamps"],
        errors="coerce",
    )

    # Remove invalid rows.
    df = df.dropna(
        subset=[
            "timestamps",
            "open",
            "high",
            "low",
            "close",
        ]
    )

    # Make sure numerical columns are numeric.
    numeric_columns = [
        "open",
        "high",
        "low",
        "close",
        "volume",
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    df = df.dropna(subset=numeric_columns)

    # Sort oldest → newest.
    df = df.sort_values("timestamps")

    # Remove duplicate timestamps.
    df = df.drop_duplicates(
        subset=["timestamps"],
        keep="last",
    )

    # Output directory.
    output_dir = Path("data") / "market_data"
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_dir /
        f"{symbol}_OHLCV.csv"
    )

    df.to_csv(
        output_file,
        index=False,
    )

    print(df.head())
    print()
    print(df.tail())
    print()
    print(f"Rows: {len(df)}")
    print(f"First date: {df['timestamps'].iloc[0]}")
    print(f"Last date: {df['timestamps'].iloc[-1]}")
    print(f"Saved: {output_file}")

    return output_file


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: python3 scripts/market_data.py "
            "<SYMBOL> [PERIOD] [INTERVAL]"
        )
        print()
        print("Examples:")
        print("  python3 scripts/market_data.py BEPL")
        print("  python3 scripts/market_data.py BEPL 5y 1d")
        print("  python3 scripts/market_data.py TCS 2y 1d")
        sys.exit(1)

    symbol = sys.argv[1]

    period = (
        sys.argv[2]
        if len(sys.argv) >= 3
        else "5y"
    )

    interval = (
        sys.argv[3]
        if len(sys.argv) >= 4
        else "1d"
    )

    try:
        fetch_historical_data(
            symbol=symbol,
            period=period,
            interval=interval,
        )

    except Exception as error:
        print()
        print(f"ERROR: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()