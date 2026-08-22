export const RESEARCH_EVIDENCE_STATUS = [
  'established',
  'source-backed-conclusion',
  'not-established',
  'inference'
] as const;

export type ResearchEvidenceStatus = typeof RESEARCH_EVIDENCE_STATUS[number];

export const RESEARCH_SOURCE_TYPES = [
  'annual_report',
  'quarterly_filing',
  'investor_presentation',
  'exchange_filing',
  'company_website',
  'regulatory_filing',
  'earnings_call',
  'grounded_web',
  'other'
] as const;

export type ResearchSourceType = typeof RESEARCH_SOURCE_TYPES[number];

export const RESEARCH_FINDING_STATUS = [
  'passes-screen',
  'excluded',
  'watchlist',
  'unresolved',
  'informational'
] as const;

export type ResearchFindingStatus = typeof RESEARCH_FINDING_STATUS[number];

export interface GroundingCitation {
  url: string;
  title?: string;
  citedText?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface ResearchEvidenceRecord {
  claim: string;
  value?: string;
  source: string;
  sourceType?: ResearchSourceType;
  citation?: string;
  confidence?: 'high' | 'medium' | 'low';
  status: ResearchEvidenceStatus;
}

export interface ResearchFindingRecord {
  label: string;
  conclusion: string;
  status: ResearchFindingStatus;
  basis?: string;
}

export interface ResearchArtifacts {
  evidence?: ResearchEvidenceRecord[];
  findings?: ResearchFindingRecord[];
  groundingCitations?: GroundingCitation[];
}

export const RESEARCH_EVIDENCE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    claim: { type: 'string', description: 'A precise factual claim being supported.' },
    value: { type: 'string', description: 'The reported figure, phrase, or observation, if available.' },
    source: { type: 'string', description: 'Source URL or document name.' },
    sourceType: { type: 'string', enum: [...RESEARCH_SOURCE_TYPES] },
    citation: { type: 'string', description: 'Exact note, page, section, or filing reference when known.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    status: { type: 'string', enum: [...RESEARCH_EVIDENCE_STATUS] }
  },
  required: ['claim', 'source', 'status']
};

export const RESEARCH_FINDING_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'Finding title, such as Current Borrowings or Verdict.' },
    conclusion: { type: 'string', description: 'Short conclusion backed by the evidence.' },
    status: { type: 'string', enum: [...RESEARCH_FINDING_STATUS] },
    basis: { type: 'string', description: 'Why this finding was reached, with any material caveat.' }
  },
  required: ['label', 'conclusion', 'status']
};
