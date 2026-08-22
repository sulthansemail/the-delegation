import { AgentActionContext } from '../ToolRegistry';
import { useCoreStore } from '../../../integration/store/coreStore';
import { useUiStore } from '../../../integration/store/uiStore';
import { GroundingCitation, ResearchArtifacts, ResearchEvidenceRecord, ResearchFindingRecord } from '../researchTypes';

function buildArtifacts(args: {
  evidence?: ResearchEvidenceRecord[];
  findings?: ResearchFindingRecord[];
  groundingCitations?: GroundingCitation[];
}): ResearchArtifacts | undefined {
  const artifacts: ResearchArtifacts = {};

  if (args.evidence?.length) artifacts.evidence = args.evidence;
  if (args.findings?.length) artifacts.findings = args.findings;
  if (args.groundingCitations?.length) artifacts.groundingCitations = args.groundingCitations;

  return Object.keys(artifacts).length > 0 ? artifacts : undefined;
}

export function completeTask(agent: AgentActionContext, args: {
  taskId: string;
  output: string;
  evidence?: ResearchEvidenceRecord[];
  findings?: ResearchFindingRecord[];
  groundingCitations?: GroundingCitation[];
}): boolean {
  const store = useCoreStore.getState();
  const { taskId, output } = args;
  const artifacts = buildArtifacts(args);

  // HUMAN-IN-THE-LOOP: If agent requires validation, submit for review instead of completing.
  const agentStatus = useUiStore.getState().agentStatuses[agent.data.index];
  
  if (agent.data.humanInTheLoop && agentStatus !== 'on_hold') {
    const tasks = useCoreStore.getState().tasks;
    const task = tasks.find(t => t.id === taskId);
    const taskTitle = task?.title || taskId;
    
    store.submitTaskForReview(taskId, output, artifacts);
    agent.setState('on_hold');
    agent.appendHistory({
      role: 'assistant',
      content: `I've finished **"${taskTitle}"** and submitted it for review.`,
      metadata: { reviewTaskId: taskId }
    });
    return true;
  }

  store.updateTaskStatus(taskId, 'done');
  store.setTaskOutput(taskId, output, artifacts);
  store.addLogEntry({ agentIndex: agent.data.index, action: `completed task`, taskId });
  
  return true;
}
