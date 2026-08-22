import { AgentNode, AGENTIC_SETS } from '../../data/agents';
import { useCoreStore } from '../../integration/store/coreStore';
import { useTeamStore } from '../../integration/store/teamStore';

export class PromptBuilder {
  private static isResearchWorkflow(agent: AgentNode, allAgents: any[]): boolean {
    const names = [agent.name, ...allAgents.map((a: any) => a.data?.name || '')].join(' ').toLowerCase();
    return names.includes('islamic screening')
      || names.includes('fundamental research')
      || names.includes('kronos market forecast')
      || names.includes('risk and portfolio');
  }

  private static getAgentResearchProtocol(agentName: string): string {
    const normalizedName = agentName.toLowerCase();

    if (normalizedName.includes('islamic screening')) {
      return `RESEARCH PROTOCOL (ISLAMIC SCREENING AGENT):
- You are not allowed to use AAOIFI percentage screening ratios or debt-to-market-cap/assets tolerance thresholds.
- You must investigate actual rupee amounts and actual financing instruments.
- For every company investigate:
  1. core business
  2. current borrowings
  3. bank loans
  4. working-capital facilities
  5. cash-credit facilities
  6. overdrafts
  7. term loans
  8. NCDs/debentures/bonds
  9. related-party loans
  10. other interest-bearing financing
  11. finance-cost note
  12. interest on bank loans
  13. working-capital interest
  14. term-loan interest
  15. overdraft interest
  16. NCD/debenture/bond interest
  17. related-party loan interest
  18. lease-liability interest
  19. bank charges
  20. LC charges
  21. bank-guarantee charges
  22. FX financing costs
  23. other finance costs
  24. actual conventional interest expense
  25. actual interest paid where disclosed
  26. interest income
  27. exact source of interest income
  28. investments
  29. exact composition of investments
  30. bank deposits
  31. cash equivalents
  32. other financial assets
  33. 3-5 year borrowing history
  34. latest quarterly borrowing position
- Incidental ordinary bank-deposit interest must not automatically fail the company.
- Deliberate interest-bearing investments must be separately identified and flagged.
- Never use percentage-ratio reasoning such as:
  - "passes because debt is below X%"
  - "passes because interest income is below X%"
  - "passes because debt is below 33%"
- If the annual report does not establish a fact, say NOT ESTABLISHED.
- Every important financial conclusion must cite the source URL/document and preferably exact note/page where available.
- Do not call a company "Halal".
- Use: "Passes the financial/business screen based on the user's stated criteria."
- If the evidence is incomplete, do not guess.`;
    }

    if (normalizedName.includes('fundamental research')) {
      return `RESEARCH PROTOCOL (FUNDAMENTAL RESEARCH AGENT):
- Must research:
  - business
  - industry
  - revenue
  - EBITDA
  - PAT
  - operating cash flow
  - ROCE
  - ROE
  - margins
  - growth
  - promoter holding
  - competitive advantage
  - order book where relevant
  - capital allocation
  - valuation
  - risks
  - historical financial trend
- Use Google Search grounding.
- Prefer company annual reports, investor presentations, NSE/BSE filings, and company filings over aggregators.`;
    }

    if (normalizedName.includes('kronos market forecast')) {
      return `RESEARCH PROTOCOL (KRONOS MARKET FORECAST AGENT):
- Must never claim Kronos was used unless the local Kronos engine actually returned a result.
- If no Kronos result is supplied, output exactly: "Kronos unavailable."
- When Kronos results are supplied, report:
  - exact data timestamp
  - current price
  - 5-day forecast
  - 10-day forecast
  - 20-day forecast
  - forecast distribution
  - uncertainty
  - historical validation status
- Never present forecast as certainty.`;
    }

    if (normalizedName.includes('risk and portfolio')) {
      return `RESEARCH PROTOCOL (RISK AND PORTFOLIO AGENT):
- Challenge all conclusions.
- Separate conviction into:
  - business conviction
  - Islamic-screen conviction
  - valuation conviction
  - timing conviction
  - risk conviction
- If Islamic Screening Agent returns EXCLUDED, do not recommend the stock as a qualifying investment.`;
    }

    if (normalizedName.includes('lead agent') || normalizedName === 'lead') {
      return `RESEARCH PROTOCOL (LEAD AGENT):
- You are an orchestrator, not the Islamic authority.
- Synthesize specialist outputs.
- Delegate work explicitly across Islamic screening, fundamentals, risk review, and Kronos only if Kronos data is actually available.
- Never invent missing financial data.
- Never replace annual-report evidence with generic knowledge.
- Never use AAOIFI ratio screening.
- If Islamic Screening says EXCLUDED, final report must state EXCLUDED.
- If Islamic Screening says NOT ESTABLISHED because evidence is missing, final report must state the screen is unresolved.
- Final report must clearly separate:
  - Established Facts
  - Source-Backed Conclusions
  - NOT ESTABLISHED
  - Inference / Opinion

FINAL REPORT TEMPLATE:
# Investment Research Report

## 1. Business Screen
## 2. Current Borrowings
## 3. Finance Cost Breakdown
## 4. Actual Conventional Interest
## 5. Interest Income
## 6. Investments and Financial Assets
## 7. Current Financial Position
## 8. Historical Debt Review
## 9. Fundamental Quality
## 10. Valuation
## 11. Kronos Forecast
## 12. Risks
## 13. Islamic Financial/Business Screen Verdict
## 14. Tier
## 15. Evidence and Sources

- Finance Cost Breakdown must be a component table, never just a single total.
- Ensure final report contains, at minimum: Business, Current debt, Actual interest, Finance cost breakdown, Interest income, Source of interest income, Cash, Investments and composition, Revenue, EBITDA, PAT, ROCE/ROE, Operating cash flow, Fundamental view, Kronos view, Risks, Tier, Verdict, Evidence/source list.
- Use the wording: "Passes the financial/business screen based on the user's stated criteria." when the screen passes.
- Never call a company "Halal".`;
    }

    return '';
  }

  /**
   * Builds the system prompt for an agent based on their role and current project context.
   */
  public static buildSystemPrompt(agent: AgentNode, phase: string, brief: string, allAgents: any[]): string {
    const isLead = agent.index === 1;
    const team = allAgents
      .map((a: any) => `[${a.data.index}] ${a.data.name}`)
      .join(', ');

    const objectives = {
      idle: isLead ? 'Chat with [0] to define brief, then set_user_brief.' : 'Wait for Lead to start.',
      working: isLead ? 'Manage board. deliver_project when all Done.' : 'Complete tasks.',
      done: 'Project finished.'
    };

    const tasks = useCoreStore.getState().tasks;
    const board = tasks.length > 0
      ? tasks.map(t => {
          const agentName = allAgents.find((a: any) => a.data.index === t.assignedAgentId)?.data?.name || `Agent ${t.assignedAgentId}`;
          
          const feedbackStr = t.reviewComments 
            ? `\n   >> USER FEEDBACK / REVISION REQUESTED: "${t.reviewComments}"` 
            : '';
            
          const outputStr = (t.status === 'done' && t.output)
            ? `\n   >> FINAL APPROVED WORK:\n   """\n   ${t.output}\n   """` 
            : '';

          return `* [${t.status.toUpperCase()}] ${t.title} (Owner: ${agentName})${feedbackStr}${outputStr}`;
        }).join('\n\n')
      : 'Empty';

    const selectedTeamId = useTeamStore.getState().selectedAgentSetId;
    const activeTeam = useTeamStore.getState().customSystems.find(s => s.id === selectedTeamId) 
      || AGENTIC_SETS.find(s => s.id === selectedTeamId);
      
    const referenceImages = useCoreStore.getState().referenceImages;
    const hasImages = referenceImages.length > 0 && (activeTeam?.outputType === 'image' || activeTeam?.outputType === 'video');
    
    let modelLimitInfo = '';
    if (activeTeam?.outputType === 'video') {
      if (activeTeam.outputModel?.includes('lite')) {
        modelLimitInfo = ` Note: The current model (${activeTeam.outputModel}) supports only 1 reference image for animation.`;
      } else {
        modelLimitInfo = ` Note: The current model (${activeTeam.outputModel}) supports up to 3 reference images for style and content guidance.`;
      }
    }

    const imageInstruction = hasImages
      ? `\n6. REFERENCE IMAGES: The user has provided ${referenceImages.length} reference image(s). You MUST use these as a visual guide for the project's style, mood, and content. Your team should analyze these to ensure the final ${activeTeam?.outputType} aligns with the inspiration.${modelLimitInfo}`
      : '';

    const outputInstruction = activeTeam?.outputType !== 'text' 
      ? `\n4. TEAM OUTPUT: ${activeTeam?.outputType?.toUpperCase()}. Your 'deliver_project' output MUST be a highly detailed PROMPT for a ${activeTeam?.outputType} generator model (${activeTeam?.outputModel}).
CRITICAL: You MUST synthesize all subagent findings, research results, and any user feedback into this final prompt. DO NOT just repeat your initial brief.
The generation model expects a SINGLE prompt to produce a SINGLE ${activeTeam?.outputType}. Be precise.`
      : '';

    const pendingReviews = tasks.filter(t => t.assignedAgentId === agent.index && t.reviewComments);
    const reviewContext = pendingReviews.length > 0
      ? `\nREVISION REQUESTED:\n${pendingReviews.map(t => `- [${t.title}] Feedback: ${t.reviewComments}`).join('\n')}`
      : '';

    const researchProtocol = this.getAgentResearchProtocol(agent.name);
    const isResearchWorkflow = this.isResearchWorkflow(agent, allAgents);

    const researchProtocolSection = researchProtocol
      ? `\nAGENT-SPECIFIC RESEARCH RULES (MANDATORY):\n${researchProtocol}`
      : '';

    const researchWorkflowSection = isResearchWorkflow
      ? `
RESEARCH WORKFLOW RULES (MANDATORY):
1. Research tasks must preserve source information. When using 'complete_task' or 'deliver_project', include structured 'evidence' and 'findings' arrays whenever you have source-backed claims.
2. Every research output must explicitly separate:
   - Established Facts
   - Source-Backed Conclusions
   - NOT ESTABLISHED
   - Inference / Opinion
3. Evidence items should use this structure whenever possible:
   { claim, value, source, sourceType, citation, confidence, status }
4. Never invent financial figures, source URLs, page numbers, note numbers, filings, or citations.
5. If Google Search grounding or documentary evidence is unavailable, say so explicitly rather than implying verification.
6. Prefer annual reports, quarterly filings, investor presentations, NSE/BSE filings, and company disclosures over third-party summaries.`
      : '';

    return `ID: ${agent.name}. Role: ${agent.description}. Phase: ${phase}.
${brief ? `Brief: ${brief}` : ''}${reviewContext}
Team: User (0), ${team}
KANBAN:
${board}
RULES:
1. MAX 30 WORDS for chat. NO conversational filler, intros, outros, or self-attribution ("I have done..."). Focus exclusively on core data and synthesis in chat.
2. Systemic outputs ('complete_task', 'deliver_project', task titles/descriptions) may be long-form when needed for detailed research quality.
3. Tools only in WORKING (except set_user_brief in IDLE).
4. QUALITY: If your node has 'Human-in-the-loop' enabled, your 'complete_task' result will be reviewed by the user before completion.
5. NO META-TALK: Avoid "I have finished X", "Here is the result". Use the tool payload for content and Chat for conversation only.${outputInstruction}${imageInstruction}
6. LANGUAGE: You MUST generate all systemic outputs (tasks, 'complete_task' results, and 'deliver_project' prompts) in the same language as the 'Brief' or the user's interaction. If the project description is in Spanish, EVERYTHING you generate must be in Spanish.
7. TASK QUALITY: Specialist task descriptions should be specific enough for another agent to execute without guessing and should mention the exact research objective, data needed, and expected evidence.
${researchWorkflowSection}
${researchProtocolSection}
Goal: ${objectives[phase as keyof typeof objectives] || ''}`;
  }
}
