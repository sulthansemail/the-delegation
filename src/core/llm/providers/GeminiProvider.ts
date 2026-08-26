import { FunctionDeclaration, GoogleGenAI, Tool, Type } from '@google/genai';
import { LLMGroundingCitation, LLMMessage, LLMProvider, LLMResponse, LLMToolCall, LLMToolDefinition } from '../types';
import { DEFAULT_MODELS } from '../constants';
import { calculateTokensForCost } from '../pricing';

export const ENABLE_GOOGLE_SEARCH_GROUNDING = true;

interface GeminiModelCandidate {
  name: string;
  displayName?: string;
  supportedActions?: string[];
}

interface CachedModelList {
  expiresAt: number;
  models: string[];
}

interface GeminiRequestCapabilities {
  customFunctionCalling: boolean;
  googleSearch: boolean;
  searchAndCustomFunctions: boolean;
}

type GeminiErrorKind = 'authentication' | 'quota' | 'rate-limit' | 'service-unavailable' | 'model' | 'other';

interface GeminiErrorInfo {
  kind: GeminiErrorKind;
  reason: string;
  retryAfterMs?: number;
}

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_GEMINI_ATTEMPTS = 2;
const MAX_BACKOFF_MS = 2000;
const modelCache = new Map<string, CachedModelList>();

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;

  constructor(private apiKey: string, client?: GoogleGenAI) {
    this.client = client || new GoogleGenAI({ apiKey });
  }

  async getAvailableModels(forceRefresh = false): Promise<string[]> {
    const cacheKey = this.getApiKeyFingerprint();
    const cached = modelCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.models;

    const discovered: GeminiModelCandidate[] = [];
    const pager = await this.client.models.list({ config: { queryBase: true, pageSize: 100 } });
    for await (const model of pager) {
      const name = typeof model.name === 'string' ? model.name.replace(/^models\//, '') : '';
      if (name) {
        discovered.push({
          name,
          displayName: model.displayName,
          supportedActions: model.supportedActions,
        });
      }
    }

    const models = this.rankTextModels(discovered);
    modelCache.set(cacheKey, { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models });
    return models;
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName: string = DEFAULT_MODELS.text
  ): Promise<LLMResponse> {
    const contents = this.mapMessagesToGemini(messages);
    const capabilities = this.getRequestCapabilities(messages, tools, systemInstruction);

    const candidates = (await this.getModelCandidates(modelName, capabilities)).slice(0, MAX_GEMINI_ATTEMPTS);
    let lastError: unknown;
    for (const [attemptIndex, candidate] of candidates.entries()) {
      try {
        const response = await this.generateCompletionWithModel(contents, tools, systemInstruction, candidate, capabilities);
        if (candidate !== candidates[0]) {
          console.info(`[GeminiProvider] Fallback succeeded with ${candidate}.`);
        } else {
          console.info(`[GeminiProvider] Selected ${candidate}.`);
        }
        return response;
      } catch (error) {
        const errorInfo = this.getErrorInfo(error);
        lastError = error;
        if (errorInfo.kind === 'authentication' || errorInfo.kind === 'other') throw error;

        if (errorInfo.kind === 'quota') {
          console.warn(`[GeminiProvider] MODEL_RATE_LIMITED model=${candidate}`);
          console.warn('[GeminiProvider] FALLBACK_STOPPED reason=project_quota_or_rate_limit');
          throw new Error('Gemini project or daily quota is exhausted. Try again later or check your Gemini quota.');
        }

        if (attemptIndex >= candidates.length - 1) break;
        if (errorInfo.kind === 'rate-limit') {
          console.warn(`[GeminiProvider] MODEL_RATE_LIMITED model=${candidate}`);
        }
        if (errorInfo.kind === 'rate-limit' || errorInfo.kind === 'service-unavailable') {
          await this.waitForBackoff(attemptIndex, errorInfo.retryAfterMs);
        }
        console.warn(`[GeminiProvider] Falling back from ${candidate}: ${errorInfo.reason}.`);
      }
    }

    throw new Error(this.getSafeErrorReason(lastError) || 'Gemini is unavailable.');
  }

  private async generateCompletionWithModel(
    contents: any[],
    tools: LLMToolDefinition[] | undefined,
    systemInstruction: string | undefined,
    modelName: string,
    capabilities: GeminiRequestCapabilities
  ): Promise<LLMResponse> {

    const functionDeclarations = tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: this.mapToGeminiSchema(t.function.parameters)
    } as FunctionDeclaration));

    const systemTools: Tool[] = [];
    if (functionDeclarations && functionDeclarations.length > 0) {
      systemTools.push({ functionDeclarations });
    }

    const grounding = this.getGroundingRequest(modelName, capabilities);

    if (grounding.status === 'unsupported-combination') {
      throw new Error(grounding.reason || `Model ${modelName} cannot combine Google Search grounding with function calling in this workflow.`);
    }

    if (grounding.enabled) {
      systemTools.push({ googleSearch: {} });
    }

    const result = await this.client.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 4096,
        tools: systemTools.length > 0 ? systemTools : undefined,
      }
    });
    const candidate = result.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const parts = candidate?.content?.parts || [];

    let contentStr: string | null = null;
    let toolCalls: LLMToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        contentStr = (contentStr || '') + part.text;
      }
    }

    // Pull tool calls from both candidates and root (some SDK versions vary)
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: Math.random().toString(36).substring(7),
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      }
    }

    if (result.functionCalls && toolCalls.length === 0) {
      for (const call of result.functionCalls) {
        toolCalls.push({
          id: Math.random().toString(36).substring(7),
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.args)
          }
        });
      }
    }

    const usage = result.usageMetadata ? {
      promptTokens: result.usageMetadata.promptTokenCount || 0,
      completionTokens: (result.usageMetadata.candidatesTokenCount || 0) + (result.usageMetadata.thoughtsTokenCount || 0),
      totalTokens: result.usageMetadata.totalTokenCount || 0
    } : undefined;

    const citations = this.extractGroundingCitations(parts);

    return {
      content: contentStr,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason: candidate?.finishReason as string,
      grounding: {
        enabled: grounding.enabled,
        citations,
        searchQueries: this.extractSearchQueries(groundingMetadata)
      },
      raw: {
        ...result,
        groundingMetadata
      }, // Return the original SDK result for technical logging
      request: {
        contents,
        systemInstruction,
        tools: systemTools.length > 0 ? systemTools : undefined,
        grounding: {
          enabled: grounding.enabled,
          status: grounding.status,
          reason: grounding.reason,
          tool: grounding.enabled ? 'googleSearch' : undefined
        }
      }
    };
  }

  private async getModelCandidates(configuredModel: string, capabilities: GeminiRequestCapabilities): Promise<string[]> {
    let discovered: string[];
    try {
      discovered = await this.getAvailableModels();
    } catch (error) {
      console.warn(`[GeminiProvider] Model discovery unavailable: ${this.getSafeErrorReason(error)}.`);
      const configured = configuredModel.replace(/^models\//, '');
      if (!this.isCompatibleWithRequest(configured, capabilities)) {
        throw new Error('No available Gemini model supports the requested tool combination.');
      }
      return configured ? [configured] : [DEFAULT_MODELS.text];
    }

    const compatible = discovered.filter(model => this.isCompatibleWithRequest(model, capabilities));
    if (compatible.length === 0) {
      throw new Error('No available Gemini model supports the requested tool combination.');
    }
    return compatible.sort((left, right) => this.modelRankForRequest(left, right, capabilities));
  }

  private getRequestCapabilities(
    messages: LLMMessage[],
    tools: LLMToolDefinition[] | undefined,
    systemInstruction?: string
  ): GeminiRequestCapabilities {
    const customFunctionCalling = Boolean(tools?.some(tool => tool.type === 'function'));
    const requestText = messages.map(message => message.content).join(' ').toLowerCase();
    const instructionText = (systemInstruction || '').toLowerCase();
    const googleSearch = !this.isSimpleDeterministicRequest(requestText)
      && (instructionText.includes('use google search grounding')
        || instructionText.includes('google search / web research')
        || (instructionText.includes('islamic screening agent') && this.requestsCurrentResearch(requestText))
        || (instructionText.includes('fundamental research agent') && this.requestsCurrentResearch(requestText))
        || this.requestsCurrentResearch(requestText));

    return {
      customFunctionCalling,
      googleSearch,
      searchAndCustomFunctions: googleSearch && customFunctionCalling,
    };
  }

  private requestsCurrentResearch(text: string): boolean {
    return /\b(research|latest|current|today|filing|filings|annual report|investor presentation|news|market data|official source)\b/.test(text);
  }

  private isSimpleDeterministicRequest(text: string): boolean {
    return /^\s*(?:what is\s+)?\d+(?:\s*[+\-*/]\s*\d+)+\s*[?!.]?\s*$/.test(text);
  }

  private isCompatibleWithRequest(modelName: string, capabilities: GeminiRequestCapabilities): boolean {
    const model = modelName.toLowerCase();
    if (!model.startsWith('gemini-')) return false;
    if (capabilities.searchAndCustomFunctions && !this.supportsGroundedFunctionCalling(modelName)) {
      console.info(`MODEL_SKIPPED model=${modelName} reason=unsupported_tool_combination`);
      return false;
    }
    return true;
  }

  private supportsGroundedFunctionCalling(modelName: string): boolean {
    // Google does not expose this combination as a reliable model-list capability.
    // Keep the compatibility policy isolated so it can be updated as model families change.
    return modelName.toLowerCase().startsWith('gemini-3');
  }

  private getGroundingRequest(modelName: string, capabilities: GeminiRequestCapabilities): {
    enabled: boolean;
    status: 'enabled' | 'disabled' | 'unsupported-model' | 'unsupported-combination';
    reason?: string;
  } {
    if (!ENABLE_GOOGLE_SEARCH_GROUNDING) {
      return { enabled: false, status: 'disabled', reason: 'Google Search grounding is disabled by configuration.' };
    }

    const hasFunctionDeclarations = capabilities.customFunctionCalling;
    if (!capabilities.googleSearch) {
      return { enabled: false, status: 'disabled', reason: 'Google Search grounding is not required for this request.' };
    }

    if (hasFunctionDeclarations && !this.supportsGroundedFunctionCalling(modelName)) {
      return {
        enabled: false,
        status: 'unsupported-combination',
        reason: `Model ${modelName} does not support Google Search with custom function calling.`
      };
    }

    if (!this.shouldEnableGoogleSearchForText(modelName)) {
      return { enabled: false, status: 'unsupported-model', reason: `Model ${modelName} is not a text model for Google Search grounding.` };
    }

    return { enabled: true, status: 'enabled' };
  }

  private rankTextModels(models: GeminiModelCandidate[]): string[] {
    return models
      .filter(model => model.supportedActions?.includes('generateContent'))
      .filter(model => {
        const name = `${model.name} ${model.displayName || ''}`.toLowerCase();
        return model.name.toLowerCase().startsWith('gemini-')
          && !name.includes('image')
          && !name.includes('audio')
          && !name.includes('video')
          && !name.includes('embedding');
      })
      .sort((left, right) => this.modelRank(left.name) - this.modelRank(right.name))
      .map(model => model.name);
  }

  private modelRank(modelName: string): number {
    const model = modelName.toLowerCase();
    if (model.includes('flash-lite')) return 0;
    if (model.includes('2.5-flash')) return 5;
    if (model.includes('flash')) return 10;
    if (model.includes('pro')) return 30;
    return 20;
  }

  private modelRankForRequest(left: string, right: string, capabilities: GeminiRequestCapabilities): number {
    if (!capabilities.searchAndCustomFunctions) return this.modelRank(left) - this.modelRank(right);

    const preferredOrder = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
    ];
    const rank = (modelName: string) => {
      const index = preferredOrder.indexOf(modelName.toLowerCase());
      return index >= 0 ? index : preferredOrder.length + this.modelRank(modelName);
    };
    return rank(left) - rank(right);
  }

  private getApiKeyFingerprint(): string {
    let hash = 2166136261;
    for (let index = 0; index < this.apiKey.length; index += 1) {
      hash ^= this.apiKey.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `gemini-${hash >>> 0}`;
  }

  private getErrorInfo(error: unknown): GeminiErrorInfo {
    const candidate = error as {
      status?: number | string;
      code?: number | string;
      message?: string;
      error?: { status?: number | string; code?: number | string; message?: string; details?: unknown[] };
      details?: unknown[];
      response?: { status?: number; headers?: Headers };
    };
    const status = String(candidate?.status ?? candidate?.error?.status ?? candidate?.response?.status ?? candidate?.code ?? candidate?.error?.code ?? '').toLowerCase();
    const details = JSON.stringify(candidate?.details ?? candidate?.error?.details ?? '').toLowerCase();
    const message = `${String(candidate?.message ?? candidate?.error?.message ?? error ?? '')} ${details}`.toLowerCase();
    const retryAfterMs = this.getRetryAfterMs(candidate?.response?.headers);

    if (status === '401' || status === '403' || status.includes('unauthenticated') || status.includes('permission_denied')
      || message.includes('invalid api key') || message.includes('authentication') || message.includes('permission denied')) {
      return { kind: 'authentication', reason: 'Gemini authentication or permission failure' };
    }
    if (message.includes('daily quota') || message.includes('per day') || message.includes('quota exceeded')
      || message.includes('project quota') || message.includes('quota_exceeded')) {
      return { kind: 'quota', reason: 'project or daily quota exhausted' };
    }
    if (status === '429' || message.includes('rate_limit_exceeded') || message.includes('rate limit')) {
      return { kind: 'rate-limit', reason: 'rate limit exceeded', retryAfterMs };
    }
    if (message.includes('resource_exhausted')) {
      return { kind: 'quota', reason: 'project or daily quota exhausted' };
    }
    if (status === '503' || status === '500' || status === '502' || status === '504' || message.includes('temporarily unavailable')) {
      return { kind: 'service-unavailable', reason: 'temporary Gemini service failure', retryAfterMs };
    }
    if (message.includes('model not found') || message.includes('model_not_found') || message.includes('invalid model')
      || message.includes('unsupported model') || message.includes('unavailable model')) {
      return { kind: 'model', reason: 'model unavailable' };
    }
    return { kind: 'other', reason: 'Gemini request failed' };
  }

  private async waitForBackoff(attemptIndex: number, retryAfterMs?: number): Promise<void> {
    const delayMs = Math.min(retryAfterMs ?? 250 * (2 ** attemptIndex), MAX_BACKOFF_MS);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  private getRetryAfterMs(headers?: Headers): number | undefined {
    const retryAfter = headers?.get('retry-after');
    if (!retryAfter) return undefined;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const retryAt = Date.parse(retryAfter);
    return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
  }

  private getSafeErrorReason(error: unknown): string {
    if (!error) return '';
    const errorInfo = this.getErrorInfo(error);
    if (errorInfo.kind === 'quota') return 'Gemini project or daily quota is exhausted';
    if (errorInfo.kind === 'rate-limit') return 'Gemini rate limit exceeded';
    if (errorInfo.kind === 'service-unavailable') return 'temporary Gemini service failure';
    if (errorInfo.kind === 'authentication') return 'Gemini authentication or permission failure';
    if (errorInfo.kind === 'model') return 'Gemini model unavailable';
    return 'Gemini request failed';
  }

  private shouldEnableGoogleSearchForText(modelName: string): boolean {
    const model = modelName.toLowerCase();
    return !model.includes('image') && !model.includes('audio') && !model.includes('video');
  }

  private extractGroundingCitations(parts: any[]): LLMGroundingCitation[] {
    const citations: LLMGroundingCitation[] = [];

    for (const part of parts) {
      const text = part.text || '';
      const annotations = part.annotations || [];

      for (const annotation of annotations) {
        const rawCitation = annotation.urlCitation || annotation;
        const url = rawCitation?.url;
        if (!url) continue;

        const startIndex = rawCitation.startIndex ?? annotation.startIndex;
        const endIndex = rawCitation.endIndex ?? annotation.endIndex;
        const citedText = typeof startIndex === 'number' && typeof endIndex === 'number'
          ? text.slice(startIndex, endIndex)
          : undefined;

        citations.push({
          url,
          title: rawCitation.title,
          citedText,
          startIndex,
          endIndex
        });
      }
    }

    return citations;
  }

  private extractSearchQueries(groundingMetadata: any): string[] | undefined {
    const directQueries = groundingMetadata?.webSearchQueries;
    if (Array.isArray(directQueries) && directQueries.length > 0) {
      return directQueries.filter((query: unknown): query is string => typeof query === 'string' && query.length > 0);
    }

    const chunks = groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      const queries = chunks
        .map((chunk: any) => chunk?.web?.query || chunk?.query)
        .filter((query: unknown): query is string => typeof query === 'string' && query.length > 0);
      return queries.length > 0 ? Array.from(new Set(queries)) : undefined;
    }

    return undefined;
  }

  async generateImage(
    prompt: string,
    modelName: string = DEFAULT_MODELS.image,
    onProgress?: (msg: string) => void,
    options: { aspectRatio?: string; imageSize?: string } = {},
    images?: string[]
  ): Promise<{ data: string; usage?: any }> {
    if (onProgress) onProgress("Generating image...");

    const config = {
      responseModalities: ["IMAGE", "TEXT"],
      imageConfig: {
        aspectRatio: options.aspectRatio || '16:9',
        imageSize: options.imageSize || '1K', // Default 1K, options: '512', '1K', '2K', '4K'
      }
    };

    const contents: any[] = [{ text: prompt }];

    if (images && images.length > 0) {
      for (const img of images) {
        const base64Match = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (base64Match) {
          contents.push({
            inlineData: {
              mimeType: base64Match[1],
              data: base64Match[2]
            }
          });
        }
      }
    }

    const result = await this.client.models.generateContent({
      model: modelName,
      contents,
      config: config as any
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let base64Data: string | undefined;

    for (const part of parts) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
      }
    }

    const imageTokens = calculateTokensForCost(modelName, 1);

    return {
      data: base64Data || '',
      usage: {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: (result.usageMetadata?.candidatesTokenCount || 0) + imageTokens,
        totalTokens: (result.usageMetadata?.totalTokenCount || 0) + imageTokens,
        count: 1
      }
    };
  }

  async generateAudio(
    prompt: string,
    modelName: string = DEFAULT_MODELS.music,
    onProgress?: (msg: string) => void
  ): Promise<{ data: string; usage?: any }> {
    if (onProgress) onProgress("Generating audio...");
    const result = await this.client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      }
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let base64Data: string | undefined;

    for (const part of parts) {
      if (part.inlineData) {
        base64Data = part.inlineData.data;
      }
    }

    const audioTokens = calculateTokensForCost(modelName, 1);

    return {
      data: base64Data || '',
      usage: {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: (result.usageMetadata?.candidatesTokenCount || 0) + audioTokens,
        totalTokens: (result.usageMetadata?.totalTokenCount || 0) + audioTokens,
        count: 1
      }
    };
  }

  async generateVideo(
    prompt: string,
    modelName: string = DEFAULT_MODELS.video,
    onProgress?: (msg: string) => void,
    options: {
      resolution?: '720p' | '1080p' | '4k';
      aspectRatio?: '16:9' | '9:16';
      durationSeconds?: 4 | 6 | 8;
    } = {},
    images?: string[]
  ): Promise<{ videoUrl: string; usage?: any }> {
    if (modelName.includes('lite')) {
      return this.createVideoLite(prompt, modelName, onProgress, options, images);
    } else {
      return this.createVideo(prompt, modelName, onProgress, options, images);
    }
  }

  private async createVideo(
    prompt: string,
    modelName: string,
    onProgress?: (msg: string) => void,
    options: any = {},
    images?: string[]
  ): Promise<{ videoUrl: string; usage?: any }> {
    const videoConfig: any = {
      resolution: options.resolution || '720p',
      aspectRatio: options.aspectRatio || '16:9',
      durationSeconds: options.durationSeconds || 4,
      sampleCount: 1,
    };

    const generateVideoPayload: any = {
      model: modelName,
      config: videoConfig
    };

    if (prompt) {
      generateVideoPayload.prompt = prompt;
    }

    if (images && images.length > 0) {
      const referenceImagesPayload: any[] = [];
      for (const img of images) {
        const m = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (m) {
          referenceImagesPayload.push({
            image: {
              imageBytes: m[2],
              mimeType: m[1]
            },
            referenceType: 'asset' // Using lowercase string as currently mapped in other parts
          });
        }
      }
      
      if (referenceImagesPayload.length > 0) {
        generateVideoPayload.config.referenceImages = referenceImagesPayload;
        // MUST be 8 when using reference images
        videoConfig.durationSeconds = 8;
      }
    }

    // Also must be 8 for 1080p or 4k
    if (videoConfig.resolution === '1080p' || videoConfig.resolution === '4k') {
      videoConfig.durationSeconds = 8;
    }

    let operation = await (this.client.models as any).generateVideos(generateVideoPayload);

    return this.pollVideoOperation(operation, modelName, onProgress);
  }

  private async createVideoLite(
    prompt: string,
    modelName: string,
    onProgress?: (msg: string) => void,
    options: any = {},
    images?: string[]
  ): Promise<{ videoUrl: string; usage?: any }> {
    const videoConfig: any = {
      resolution: options.resolution || '720p',
      aspectRatio: options.aspectRatio || '16:9',
      durationSeconds: options.durationSeconds || 4,
      sampleCount: 1,
    };

    const request: any = {
      model: modelName,
      prompt: prompt,
      config: videoConfig
    };

    if (images && images.length > 0) {
      // Lite models support 1 primary image for animation (Image object)
      const m = images[0].match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (m) {
        request.image = {
          imageBytes: m[2],
          mimeType: m[1]
        };
      }
    }

    // Use the official SDK Client
    let operation = await (this.client.models as any).generateVideos(request);

    return this.pollVideoOperation(operation, modelName, onProgress);
  }

  private async pollVideoOperation(
    operation: any,
    modelName: string,
    onProgress?: (msg: string) => void
  ): Promise<{ videoUrl: string; usage?: any }> {
    while (!operation.done) {
      if (onProgress) onProgress("Generating video (this may take a minute)...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await (this.client as any).operations.getVideosOperation({
        operation: operation,
      });
    }

    const videoData = operation.response?.generatedVideos?.[0];
    let videoUri = (videoData?.video as any)?.uri || '';

    if (videoUri && videoUri.includes('generativelanguage.googleapis.com')) {
      const separator = videoUri.includes('?') ? '&' : '?';
      videoUri += `${separator}key=${this.apiKey}`;
    }

    const videoDuration = videoData?.durationSeconds || 4;
    const videoTokens = calculateTokensForCost(modelName, videoDuration);

    return {
      videoUrl: videoUri,
      usage: {
        promptTokens: 0,
        completionTokens: videoTokens,
        totalTokens: videoTokens,
        duration: videoDuration
      }
    };
  }

  private mapMessagesToGemini(messages: LLMMessage[]): any[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (m.content) {
          parts.push({ text: m.content });
        }

        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          }
        }

        if (m.role === 'tool' && m.name) {
          parts.push({
            functionResponse: {
              name: m.name,
              response: JSON.parse(m.content)
            }
          });
        }

        if (m.images) {
          for (const img of m.images) {
            // Strip data URL prefix if present: "data:image/png;base64,..."
            const base64Match = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
            if (base64Match) {
              parts.push({
                inlineData: {
                  mimeType: base64Match[1],
                  data: base64Match[2]
                }
              });
            } else {
              // Assume it's already a raw base64 string and default to jpeg
              parts.push({
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: img
                }
              });
            }
          }
        }

        return { role, parts };
      });
  }

  private mapToGeminiSchema(schema: any): any {
    if (!schema) return undefined;

    const typeStr = (schema.type || 'string').toUpperCase();
    const mappedType = Type[typeStr as keyof typeof Type] || Type.STRING;

    const result: any = {
      type: mappedType,
      description: schema.description,
      nullable: schema.nullable,
      minItems: schema.minItems,
      maxItems: schema.maxItems,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
    };

    if (schema.properties) {
      result.properties = Object.keys(schema.properties).reduce((acc, key) => {
        acc[key] = this.mapToGeminiSchema(schema.properties[key]);
        return acc;
      }, {} as Record<string, any>);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    if (schema.items) {
      result.items = this.mapToGeminiSchema(schema.items);
    }

    if (schema.enum) {
      result.enum = schema.enum;
    }

    return result;
  }
}
