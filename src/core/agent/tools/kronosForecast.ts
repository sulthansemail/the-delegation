import { AgentActionContext } from '../ToolRegistry';
import { useCoreStore } from '../../../integration/store/coreStore';
import {
  forecastWithKronos,
  validateKronosForecastArgs,
  KronosForecastResult,
} from '../../../core/integration/kronosClient';
import type { KronosInterval } from '../../../core/integration/kronosClient';

export type { KronosInterval } from '../../../core/integration/kronosClient';

export interface KronosForecastArgs {
  instrument_key: string;
  interval?: KronosInterval;
  lookback?: number;
  forecast_horizon?: number;
}

export type KronosForecastToolResult = KronosForecastResult & {
  evidence?: Array<{
    claim: string;
    value?: string;
    source: string;
    sourceType?: 'other';
    citation?: string;
    confidence?: 'high' | 'medium' | 'low';
    status: 'inference';
  }>;
  findings?: Array<{
    label: string;
    conclusion: string;
    status: 'informational';
    basis?: string;
  }>;
};

export async function kronosForecast(agent: AgentActionContext, args: Partial<KronosForecastArgs>): Promise<KronosForecastToolResult> {
  const store = useCoreStore.getState();
  const agentName = agent.data.name || 'Kronos Market Forecast Agent';
  const normalized = validateKronosForecastArgs(args as Record<string, unknown>);

  const buildEvidence = (instrument: string, interval: string, values: any[]) => ({
    claim: `Kronos forecast for ${instrument} at ${interval} interval`,
    value: values.length ? JSON.stringify(values.slice(-Math.min(5, values.length))) : 'Unavailable',
    source: 'Kronos API',
    sourceType: 'other' as const,
    confidence: 'medium' as const,
    status: 'inference' as const
  });

  store.addActivityEvent({
    agentIndex: agent.data.index,
    agentName: agentName,
    event: 'researching',
    message: `${agentName} requesting Kronos forecast.`
  });

  if ('status' in normalized) {
    store.addActivityEvent({
      agentIndex: agent.data.index,
      agentName: agentName,
      event: 'failed',
      message: `${agentName}: Kronos forecast unavailable.`
    });
    agent.appendHistory({
      role: 'tool',
      name: 'kronos_forecast',
      content: JSON.stringify(normalized),
    });
    return normalized;
  }

  try {
    const result = await forecastWithKronos({
      instrumentKey: normalized.instrumentKey,
      interval: normalized.interval,
      lookback: normalized.lookback,
      forecastHorizon: normalized.forecastHorizon,
    });

    if (result.status === 'error') {
      store.addActivityEvent({
        agentIndex: agent.data.index,
        agentName: agentName,
        event: 'failed',
        message: `${agentName}: Kronos forecast unavailable.`
      });
      agent.appendHistory({
        role: 'tool',
        name: 'kronos_forecast',
        content: JSON.stringify(result),
      });
      return result;
    }

    store.addActivityEvent({
      agentIndex: agent.data.index,
      agentName: agentName,
      event: 'researching',
      message: `${agentName} received Kronos forecast.`
    });

    const evidence = result.forecast.length
      ? [buildEvidence(result.instrumentKey, result.interval, result.forecast)]
      : undefined;

    const toolResult = {
      ...result,
      evidence,
      findings: result.forecast.length
        ? [{
            label: 'Kronos Forecast',
            conclusion: `External Kronos forecast received for ${result.instrumentKey}.`,
            status: 'informational' as const,
            basis: 'Forecast data returned by the Kronos service for the requested instrument and horizon.'
          }]
        : undefined
    };
    agent.appendHistory({
      role: 'tool',
      name: 'kronos_forecast',
      content: JSON.stringify(toolResult),
    });
    return toolResult;
  } catch (error) {
    store.addActivityEvent({
      agentIndex: agent.data.index,
      agentName: agentName,
      event: 'failed',
      message: `${agentName}: Kronos forecast unavailable.`
    });
    const unavailable = { status: 'error' as const, error: 'Kronos forecast unavailable.' };
    agent.appendHistory({
      role: 'tool',
      name: 'kronos_forecast',
      content: JSON.stringify(unavailable),
    });
    return unavailable;
  }
}
