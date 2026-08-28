import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { spawn } from 'child_process';

function localMarketDataApi(): Plugin {
  return {
    name: 'local-market-data-api',

    configureServer(server) {
      server.middlewares.use(
        '/api/market-data',
        async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: 'Method not allowed.',
              })
            );
            return;
          }

          try {
            let body = '';

            for await (const chunk of req) {
              body += chunk;
            }

            const parsed = JSON.parse(body);

            const symbol = String(
              parsed?.symbol ?? ''
            )
              .trim()
              .toUpperCase();

            const period = String(
              parsed?.period ?? '5y'
            );

            const interval = String(
              parsed?.interval ?? '1d'
            );

            if (!/^[A-Z0-9._-]+$/.test(symbol)) {
              throw new Error(
                'Invalid stock symbol.'
              );
            }

            const allowedPeriods = new Set([
              '1mo',
              '3mo',
              '6mo',
              '1y',
              '2y',
              '5y',
              '10y',
              'max',
            ]);

            const allowedIntervals = new Set([
              '1d',
              '1wk',
              '1mo',
            ]);

            if (!allowedPeriods.has(period)) {
              throw new Error(
                `Unsupported period: ${period}`
              );
            }

            if (!allowedIntervals.has(interval)) {
              throw new Error(
                `Unsupported interval: ${interval}`
              );
            }

            const projectRoot = process.cwd();

            const pythonPath = path.join(
              projectRoot,
              '.venv',
              'bin',
              'python'
            );

            const scriptPath = path.join(
              projectRoot,
              'scripts',
              'market_data.py'
            );

            const result =
              await runPythonMarketData(
                pythonPath,
                scriptPath,
                symbol,
                period,
                interval,
                projectRoot
              );

            res.statusCode = result.success
              ? 200
              : 500;

            res.setHeader(
              'Content-Type',
              'application/json'
            );

            res.end(
              JSON.stringify(result)
            );
          } catch (error) {
            res.statusCode = 400;
            res.setHeader(
              'Content-Type',
              'application/json'
            );

            res.end(
              JSON.stringify({
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Market-data request failed.',
              })
            );
          }
        }
      );
    },
  };
}

function runPythonMarketData(
  pythonPath: string,
  scriptPath: string,
  symbol: string,
  period: string,
  interval: string,
  projectRoot: string
): Promise<{
  success: boolean;
  symbol: string;
  file?: string;
  rows?: number;
  firstDate?: string;
  lastDate?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(
      pythonPath,
      [
        scriptPath,
        symbol,
        period,
        interval,
      ],
      {
        cwd: projectRoot,
        env: process.env,
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        symbol,
        error:
          `Unable to start Python market-data process: ` +
          error.message,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          symbol,
          error:
            stderr.trim() ||
            stdout.trim() ||
            `Python process exited with code ${code}.`,
        });

        return;
      }

      const outputFile = path.join(
        projectRoot,
        'data',
        'market_data',
        `${symbol}_OHLCV.csv`
      );

      const rowsMatch = stdout.match(
        /Rows:\s*(\d+)/
      );

      const firstDateMatch = stdout.match(
        /First date:\s*(.+)/
      );

      const lastDateMatch = stdout.match(
        /Last date:\s*(.+)/
      );

      resolve({
        success: true,
        symbol,
        file: outputFile,
        rows: rowsMatch
          ? Number(rowsMatch[1])
          : undefined,
        firstDate: firstDateMatch
          ? firstDateMatch[1].trim()
          : undefined,
        lastDate: lastDateMatch
          ? lastDateMatch[1].trim()
          : undefined,
      });
    });
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: '/the-delegation/',

    plugins: [
      react(),
      tailwindcss(),
      localMarketDataApi(),
    ],

    define: {
      'process.env.GEMINI_API_KEY':
        JSON.stringify(env.GEMINI_API_KEY),

      'process.env.KRONOS_API_URL':
        JSON.stringify(env.KRONOS_API_URL),

      'process.env.KRONOS_INTERNAL_API_KEY':
        JSON.stringify(
          env.KRONOS_INTERNAL_API_KEY
        ),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr:
        process.env.DISABLE_HMR !== 'true',

      watch: {
        ignored: [
          '**/data/market_data/**',
        ],
      },
    },
  };
});