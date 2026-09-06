export const DEFAULT_MODELS = {
  text: 'gemini-3.7-flash',
  image: 'gemini-2.5-flash-image-preview',
  music: 'lyria-3-clip-preview',
  video: 'veo-2.0-generate-001'
} as const;

export const AVAILABLE_MODELS = {
  text: [
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview'
  ],
  image: [
    'gemini-2.5-flash-image-preview',
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.0-flash-exp-image-generation'
  ],
  music: [
    'lyria-3-clip-preview',
    'lyria-3-pro-preview'
  ],
  video: [
    'veo-2.0-generate-001',
    'veo-2.0-fast-generate-001'
  ]
} as const;

export type ModelType = keyof typeof AVAILABLE_MODELS;
