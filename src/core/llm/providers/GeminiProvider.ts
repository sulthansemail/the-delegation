import { FunctionDeclaration, GoogleGenAI, Tool, Type } from '@google/genai';
import { LLMGroundingCitation, LLMMessage, LLMProvider, LLMResponse, LLMToolCall, LLMToolDefinition } from '../types';
import { DEFAULT_MODELS } from '../constants';
import { calculateTokensForCost } from '../pricing';

export const ENABLE_GOOGLE_SEARCH_GROUNDING = true;

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;

  constructor(private apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName: string = DEFAULT_MODELS.text
  ): Promise<LLMResponse> {
    const contents = this.mapMessagesToGemini(messages);

    const functionDeclarations = tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: this.mapToGeminiSchema(t.function.parameters)
    } as FunctionDeclaration));

    const systemTools: Tool[] = [];
    if (functionDeclarations && functionDeclarations.length > 0) {
      systemTools.push({ functionDeclarations });
    }

    const grounding = this.getGroundingRequest(modelName, Boolean(functionDeclarations?.length));

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

  private getGroundingRequest(modelName: string, hasFunctionDeclarations: boolean): {
    enabled: boolean;
    status: 'enabled' | 'disabled' | 'unsupported-model' | 'unsupported-combination';
    reason?: string;
  } {
    if (!ENABLE_GOOGLE_SEARCH_GROUNDING) {
      return { enabled: false, status: 'disabled', reason: 'Google Search grounding is disabled by configuration.' };
    }

    if (!this.shouldEnableGoogleSearchForText(modelName)) {
      return { enabled: false, status: 'unsupported-model', reason: `Model ${modelName} is not a text model for Google Search grounding.` };
    }

    if (hasFunctionDeclarations && !this.supportsGroundedFunctionCalling(modelName)) {
      return {
        enabled: false,
        status: 'unsupported-combination',
        reason: `Model ${modelName} does not safely support combining Google Search grounding with function calling in this app. Select a Gemini 3 text model.`
      };
    }

    return { enabled: true, status: 'enabled' };
  }

  private shouldEnableGoogleSearchForText(modelName: string): boolean {
    const model = modelName.toLowerCase();
    return !model.includes('image') && !model.includes('audio') && !model.includes('video');
  }

  private supportsGroundedFunctionCalling(modelName: string): boolean {
    const model = modelName.toLowerCase();
    return model.startsWith('gemini-3');
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
