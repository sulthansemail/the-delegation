import { LLMMessage } from '../llm/types';
import { setUserBrief } from './tools/setUserBrief';
import { proposeTask } from './tools/proposeTask';
import { completeTask } from './tools/completeTask';
import { deliverProject } from './tools/deliverProject';
import { kronosForecast } from './tools/kronosForecast';
import { getHistoricalMarketData } from './tools/marketData';
import { RESEARCH_EVIDENCE_ITEM_SCHEMA, RESEARCH_FINDING_ITEM_SCHEMA } from './researchTypes';

export interface ToolCall {
  name: string;
  args: any;
}

/**
 * Interface that decuples the ToolRegistry from the 3D Simulation (AgentHost).
 * This allows the tool logic to be tested and used independently of the simulation.
 */
export interface AgentActionContext {
  data: { index: number; name: string, subagents?: any[], humanInTheLoop?: boolean };
  setState: (state: 'idle' | 'moving' | 'working' | 'on_hold' | 'talking') => void;
  appendHistory: (message: LLMMessage) => void;
}

export class ToolRegistry {
  /**
   * Processes a tool call by dispatching it to the appropriate tool handler.
   */
  public static async process(agent: AgentActionContext, toolCall: ToolCall): Promise<boolean> {
    const { name, args } = toolCall;

    switch (name) {
      case 'set_user_brief':
        return setUserBrief(agent, args);
      case 'propose_task':
        return proposeTask(agent, args);
      case 'complete_task':
        return completeTask(agent, args);
      case 'deliver_project':
        return deliverProject(agent, args);
      case 'kronos_forecast':
        await kronosForecast(agent, args);
        return true;
      case 'get_historical_market_data':
        await getHistoricalMarketData(args);
        return true;    
      default:
        console.warn(`[ToolRegistry] Unknown tool: ${name}`);
        return false;
    }
  }

  public static getDefinitions(agentIndex: number, phase: string, subagentsCount: number = 0): any[] {
    const isLead = agentIndex === 1;
    const isManager = subagentsCount > 0;
    const tools: any[] = [];

    // 1. Idle Phase: Only Lead can set the brief
    if (phase === 'idle') {
      if (isLead) {
        tools.push({
          type: 'function',
          function: {
            name: 'set_user_brief',
            description: 'Start project with brief.',
            parameters: {
              type: 'object',
              properties: { brief: { type: 'string' } },
              required: ['brief']
            }
          }
        });
      }
      return tools;
    }

    // 2. Working Phase: Common tools for everyone
    if (phase === 'working') {
      if (isLead || isManager) {
        tools.push({
          type: 'function',
          function: {
            name: 'propose_task',
            description: 'Assign task to agent.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                agentId: { type: 'integer', description: 'Agent index' },
                requiresApproval: { type: 'boolean' }
              },
              required: ['title', 'description', 'agentId']
            }
          }
        });
      }
      tools.push({
  type: 'function',
  function: {
    name: 'get_historical_market_data',
    description:
      'Download current historical OHLCV market data for an NSE stock using the local Mac Python/yfinance environment. The data is saved locally and returned as structured metadata. Use this before performing technical or quantitative analysis that requires historical price data.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: {
          type: 'string',
          description:
            'NSE stock symbol, for example BEPL, TCS, INFY, or CASTROLIND.'
        },
        period: {
          type: 'string',
          enum: [
            '1mo',
            '3mo',
            '6mo',
            '1y',
            '2y',
            '5y',
            '10y',
            'max'
          ],
          default: '5y',
          description:
            'Historical period to download.'
        },
        interval: {
          type: 'string',
          enum: [
            '1d',
            '1wk',
            '1mo'
          ],
          default: '1d',
          description:
            'Historical candle interval.'
        }
      },
      required: ['symbol']
    }
  }
});

      tools.push(
        {
          type: 'function',
          function: {
            name: 'complete_task',
            description: 'Finish task. Output must be raw content, no introductions or credit for the work. For research workflows, include source-preserving evidence and findings whenever available.',
            parameters: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                output: { type: 'string', description: 'Task result in Markdown (e.g. code blocks, text, or research).' },
                evidence: {
                  type: 'array',
                  description: 'Optional structured evidence records for research outputs.',
                  items: RESEARCH_EVIDENCE_ITEM_SCHEMA
                },
                findings: {
                  type: 'array',
                  description: 'Optional structured findings derived from the research.',
                  items: RESEARCH_FINDING_ITEM_SCHEMA
                }
              },
              required: ['taskId', 'output']
            }
          }
        },
      );

      if (agentIndex === 5) {
        tools.push({
          type: 'function',
          function: {
            name: 'kronos_forecast',
            description: 'Request an external Kronos market forecast for a stock or instrument. The model may provide only instrument_key, interval, lookback, and forecast_horizon. No Upstox tokens, no Kronos internal API keys, and no Authorization headers are allowed.',
            parameters: {
              type: 'object',
              additionalProperties: false,
              properties: {
                instrument_key: { type: 'string', description: 'Instrument identifier such as NSE_EQ|INE002A01018.' },
                interval: { type: 'string', enum: ['day', '1minute', '5minute', '15minute', '30minute'], default: 'day', description: 'Forecast interval.' },
                lookback: { type: 'integer', minimum: 1, maximum: 512, default: 120, description: 'Historical lookback length.' },
                forecast_horizon: { type: 'integer', minimum: 1, maximum: 128, default: 5, description: 'How many periods to forecast.' }
              },
              required: ['instrument_key']
            }
          }
        });
      }

      if (isLead) {
        tools.push({
          type: 'function',
          function: {
            name: 'deliver_project',
            description: 'Final delivery of the full project results. For research workflows, include source-preserving evidence and findings whenever available.',
            parameters: {
              type: 'object',
              properties: { 
                output: { 
                  type: 'string', 
                  description: 'Full project document in Markdown. NO attribution needed.' 
                },
                evidence: {
                  type: 'array',
                  description: 'Optional structured evidence records for the final delivery.',
                  items: RESEARCH_EVIDENCE_ITEM_SCHEMA
                },
                findings: {
                  type: 'array',
                  description: 'Optional structured findings for the final delivery.',
                  items: RESEARCH_FINDING_ITEM_SCHEMA
                }
              },
              required: ['output']
            }
          }
        });
      }
    }

    return tools;
  }
}
