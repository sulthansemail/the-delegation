import { User, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { AgentState } from '../../types';
import { useCoreStore } from '../store/coreStore';
import { useMarketStore } from '../store/marketStore';
import { getFirebaseServices } from './firebase';

interface PersistedProjectDoc {
  projectId: string;
  name: string | null;
  teamId: string | null;
  status: 'idle' | 'working' | 'done';
  createdAt: number | null;
  updatedAt: number | null;
  currentRunId: string | null;
  currentRunNumber: number;
  runHistory: any[];
  selectedSymbol: string;
  portfolio: any[];
  // Project chat: ONE continuous conversation per project, spans all runs.
  agentHistories: Record<number, any[]>;
  agentSummaries: Record<number, string>;
  boardroomHistories: Record<string, any[]>;
  schemaVersion: number;
  migratedFromLocalStorage?: boolean;
  serverUpdatedAt?: unknown;
}

interface PersistedRunDoc {
  runId: string;
  runNumber: number;
  status: 'idle' | 'working' | 'done';
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  userBrief: string;
  referenceImages: string[];
  completionInProgress: boolean;
  finalOutput: string | null;
  finalOutputArtifacts: any;
  finalAssetType: 'text' | 'image' | 'audio' | 'video';
  finalAssetContent: string | null;
  isGeneratingAsset: boolean;
  isReviewingOutput: boolean;
  pendingOutputPrompt: string;
  pendingOutputParams: any;
  tasks: any[];
  actionLog: any[];
  activityLog: any[];
  debugLog: any[];
  agentExecutionStates: Record<number, AgentState>;
  totalTokenUsage: any;
  agentTokenUsage: Record<number, any>;
  totalEstimatedCost: number;
  agentEstimatedCost: Record<number, number>;
  runMarketSnapshots: any[];
  runAnalyses: any[];
  currentAnalysis: any;
  schemaVersion: number;
  serverUpdatedAt?: unknown;
}

const SCHEMA_VERSION = 1;
const MIGRATION_PREFIX = 'firestore-migration';

let initialized = false;
let writeDebounce: ReturnType<typeof setTimeout> | null = null;

function ensureLocalRunIdentityForLegacyState() {
  const state = useCoreStore.getState();
  if (!state.projectId || state.currentRunId) return;

  const now = Date.now();
  const inferredRunId = `run_legacy_${now}`;
  const inferredRunNumber = state.currentRunNumber > 0 ? state.currentRunNumber : 1;
  const createdAt = state.projectCreatedAt ?? now;
  const updatedAt = state.projectUpdatedAt ?? now;

  useCoreStore.setState((previous) => ({
    ...previous,
    currentRunId: inferredRunId,
    currentRunNumber: inferredRunNumber,
    currentRunCreatedAt: createdAt,
    currentRunUpdatedAt: updatedAt,
    currentRunCompletedAt: previous.phase === 'done' ? updatedAt : null,
    runHistory: previous.runHistory?.length
      ? previous.runHistory
      : [
          {
            runId: inferredRunId,
            runNumber: inferredRunNumber,
            status: previous.phase,
            createdAt,
            updatedAt,
            completedAt: previous.phase === 'done' ? updatedAt : null,
            symbol: previous.selectedSymbol || 'BEPL',
          },
        ],
    runMarketSnapshots: previous.runMarketSnapshots || [],
    runAnalyses: previous.runAnalyses || [],
  }));
}

function migrationKey(uid: string, projectId: string): string {
  return `${MIGRATION_PREFIX}:${uid}:${projectId}`;
}

function usersProjectsPath(uid: string) {
  return collection(getFirebaseServices()!.db, 'users', uid, 'projects');
}

function projectRef(uid: string, projectId: string) {
  return doc(getFirebaseServices()!.db, 'users', uid, 'projects', projectId);
}

function runRef(uid: string, projectId: string, runId: string) {
  return doc(getFirebaseServices()!.db, 'users', uid, 'projects', projectId, 'runs', runId);
}

function buildProjectDoc(state: ReturnType<typeof useCoreStore.getState>): PersistedProjectDoc {
  const now = Date.now();
  return {
    projectId: state.projectId!,
    name: state.projectName,
    teamId: state.projectTeamId,
    status: state.phase,
    createdAt: state.projectCreatedAt,
    updatedAt: now,
    currentRunId: state.currentRunId,
    currentRunNumber: state.currentRunNumber,
    runHistory: state.runHistory,
    selectedSymbol: state.selectedSymbol,
    portfolio: state.portfolio,
    agentHistories: state.agentHistories,
    agentSummaries: state.agentSummaries,
    boardroomHistories: state.boardroomHistories,
    schemaVersion: SCHEMA_VERSION,
    serverUpdatedAt: serverTimestamp(),
  };
}

function buildRunDoc(
  coreState: ReturnType<typeof useCoreStore.getState>,
  marketState: ReturnType<typeof useMarketStore.getState>,
  explicitRunId?: string,
  explicitRunNumber?: number
): PersistedRunDoc {
  const now = Date.now();
  return {
    runId: explicitRunId || coreState.currentRunId!,
    runNumber: explicitRunNumber || coreState.currentRunNumber,
    status: coreState.phase,
    createdAt: coreState.currentRunCreatedAt,
    updatedAt: now,
    completedAt: coreState.currentRunCompletedAt,
    userBrief: coreState.userBrief,
    referenceImages: coreState.referenceImages,
    completionInProgress: coreState.completionInProgress,
    finalOutput: coreState.finalOutput,
    finalOutputArtifacts: coreState.finalOutputArtifacts,
    finalAssetType: coreState.finalAssetType,
    finalAssetContent: coreState.finalAssetContent,
    isGeneratingAsset: coreState.isGeneratingAsset,
    isReviewingOutput: coreState.isReviewingOutput,
    pendingOutputPrompt: coreState.pendingOutputPrompt,
    pendingOutputParams: coreState.pendingOutputParams,
    tasks: coreState.tasks,
    actionLog: coreState.actionLog,
    activityLog: coreState.activityLog,
    debugLog: coreState.debugLog,
    agentExecutionStates: coreState.agentExecutionStates,
    totalTokenUsage: coreState.totalTokenUsage,
    agentTokenUsage: coreState.agentTokenUsage,
    totalEstimatedCost: coreState.totalEstimatedCost,
    agentEstimatedCost: coreState.agentEstimatedCost,
    runMarketSnapshots: coreState.runMarketSnapshots,
    runAnalyses: coreState.runAnalyses,
    currentAnalysis: marketState.currentAnalysis,
    schemaVersion: SCHEMA_VERSION,
    serverUpdatedAt: serverTimestamp(),
  };
}

function hydrateFromFirestore(projectData: PersistedProjectDoc, runData: PersistedRunDoc | null) {
  const now = Date.now();
  const allowedStates: AgentState[] = ['idle', 'moving', 'working', 'on_hold', 'talking'];
  const hydratedExecutionStates: Record<number, AgentState> = Object.entries(runData?.agentExecutionStates ?? {}).reduce(
    (acc, [index, value]) => {
      if (allowedStates.includes(value as AgentState)) {
        acc[Number(index)] = value as AgentState;
      }
      return acc;
    },
    {} as Record<number, AgentState>
  );

  useCoreStore.setState((previous) => ({
    ...previous,
    projectId: projectData.projectId,
    projectName: projectData.name,
    projectTeamId: projectData.teamId,
    projectCreatedAt: projectData.createdAt,
    projectUpdatedAt: projectData.updatedAt ?? now,
    phase: (runData?.status ?? projectData.status) || 'idle',
    currentRunId: projectData.currentRunId,
    currentRunNumber: projectData.currentRunNumber || 0,
    currentRunCreatedAt: runData?.createdAt ?? null,
    currentRunUpdatedAt: runData?.updatedAt ?? null,
    currentRunCompletedAt: runData?.completedAt ?? null,
    runHistory: projectData.runHistory || [],
    selectedSymbol: projectData.selectedSymbol || previous.selectedSymbol,
    portfolio: projectData.portfolio || [],
    // Project chat is continuous across runs; always sourced from the project doc.
    agentHistories: projectData.agentHistories || {},
    agentSummaries: projectData.agentSummaries || {},
    boardroomHistories: projectData.boardroomHistories || {},

    userBrief: runData?.userBrief ?? '',
    referenceImages: runData?.referenceImages ?? [],
    completionInProgress: runData?.completionInProgress ?? false,
    finalOutput: runData?.finalOutput ?? null,
    finalOutputArtifacts: runData?.finalOutputArtifacts ?? null,
    finalAssetType: runData?.finalAssetType ?? 'text',
    finalAssetContent: runData?.finalAssetContent ?? null,
    isGeneratingAsset: runData?.isGeneratingAsset ?? false,
    isReviewingOutput: runData?.isReviewingOutput ?? false,
    pendingOutputPrompt: runData?.pendingOutputPrompt ?? '',
    pendingOutputParams: runData?.pendingOutputParams ?? {},
    tasks: runData?.tasks ?? [],
    actionLog: runData?.actionLog ?? [],
    activityLog: runData?.activityLog ?? [],
    debugLog: runData?.debugLog ?? [],
    agentExecutionStates: hydratedExecutionStates,
    totalTokenUsage: runData?.totalTokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    agentTokenUsage: runData?.agentTokenUsage ?? {},
    totalEstimatedCost: runData?.totalEstimatedCost ?? 0,
    agentEstimatedCost: runData?.agentEstimatedCost ?? {},
    runMarketSnapshots: runData?.runMarketSnapshots ?? [],
    runAnalyses: runData?.runAnalyses ?? [],
  }));

  useMarketStore.setState((previous) => ({
    ...previous,
    currentAnalysis: runData?.currentAnalysis ?? previous.currentAnalysis,
  }));
}

async function ensureUser(): Promise<User | null> {
  const services = getFirebaseServices();
  if (!services) return null;

  if (services.auth.currentUser) return services.auth.currentUser;

  try {
    const credential = await signInAnonymously(services.auth);
    return credential.user;
  } catch (error) {
    console.warn('[FirestorePersistence] Unable to authenticate with Firebase.', error);
    return null;
  }
}

async function loadLatestProjectId(uid: string): Promise<string | null> {
  const projects = usersProjectsPath(uid);
  const snapshot = await getDocs(query(projects, orderBy('updatedAt', 'desc'), limit(1)));
  if (snapshot.empty) return null;
  return snapshot.docs[0]?.id || null;
}

async function loadRunDoc(uid: string, projectId: string, runId: string | null): Promise<PersistedRunDoc | null> {
  if (!runId) return null;
  const runSnapshot = await getDoc(runRef(uid, projectId, runId));
  return runSnapshot.exists() ? (runSnapshot.data() as PersistedRunDoc) : null;
}

async function persistState(uid: string, migratedFromLocalStorage = false): Promise<void> {
  const coreState = useCoreStore.getState();
  const marketState = useMarketStore.getState();
  if (!coreState.projectId || !coreState.currentRunId) return;

  const projectDoc = buildProjectDoc(coreState);
  if (migratedFromLocalStorage) {
    projectDoc.migratedFromLocalStorage = true;
  }

  const runDoc = buildRunDoc(coreState, marketState);

  await setDoc(projectRef(uid, coreState.projectId), projectDoc, { merge: true });
  await setDoc(runRef(uid, coreState.projectId, coreState.currentRunId), runDoc, { merge: true });
}

async function persistRunSnapshot(
  uid: string,
  snapshot: ReturnType<typeof useCoreStore.getState>,
  marketState: ReturnType<typeof useMarketStore.getState>
): Promise<void> {
  if (!snapshot.projectId || !snapshot.currentRunId) return;

  const runDoc = buildRunDoc(snapshot, marketState, snapshot.currentRunId, snapshot.currentRunNumber);
  await setDoc(runRef(uid, snapshot.projectId, snapshot.currentRunId), runDoc, { merge: true });
}

async function migrateLocalStateIfNeeded(uid: string): Promise<void> {
  const core = useCoreStore.getState();
  if (!core.projectId || !core.currentRunId) return;

  const key = migrationKey(uid, core.projectId);
  if (localStorage.getItem(key)) return;

  const remoteProject = await getDoc(projectRef(uid, core.projectId));
  if (remoteProject.exists()) {
    localStorage.setItem(key, String(Date.now()));
    return;
  }

  await persistState(uid, true);
  localStorage.setItem(key, String(Date.now()));
}

export async function initializeFirestorePersistence(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const services = getFirebaseServices();
  if (!services) {
    console.info('[FirestorePersistence] Firebase env is not configured; continuing with local persistence only.');
    return;
  }

  ensureLocalRunIdentityForLegacyState();

  const user = await ensureUser();
  if (!user) return;

  const localProjectId = useCoreStore.getState().projectId;
  const targetProjectId = localProjectId || await loadLatestProjectId(user.uid);

  if (targetProjectId) {
    const projectSnapshot = await getDoc(projectRef(user.uid, targetProjectId));

    if (projectSnapshot.exists()) {
      const projectData = projectSnapshot.data() as PersistedProjectDoc;
      const runData = await loadRunDoc(user.uid, targetProjectId, projectData.currentRunId);
      hydrateFromFirestore(projectData, runData);
    } else {
      await migrateLocalStateIfNeeded(user.uid);
    }
  } else {
    await migrateLocalStateIfNeeded(user.uid);
  }

  const schedulePersist = () => {
    if (writeDebounce) clearTimeout(writeDebounce);
    writeDebounce = setTimeout(() => {
      void persistState(user.uid).catch((error) => {
        console.error('[FirestorePersistence] Failed to write project state.', error);
      });
    }, 300);
  };

  let lastMarketState = useMarketStore.getState();

  useCoreStore.subscribe((state, prevState) => {
    // Preserve the completed snapshot of the previous active run before switching
    // to a new run; this prevents debounce cancellation from dropping the old run's
    // latest chat/history/results updates.
    if (state.currentRunId !== prevState.currentRunId && prevState.currentRunId && prevState.projectId) {
      void persistRunSnapshot(user.uid, prevState, lastMarketState).catch((error) => {
        console.error('[FirestorePersistence] Failed to flush previous run snapshot.', error);
      });
    }
    schedulePersist();
  });

  useMarketStore.subscribe((state) => {
    lastMarketState = state;
    schedulePersist();
  });
}

export interface ProjectSummary {
  projectId: string;
  projectName: string | null;
  status: 'idle' | 'working' | 'done';
  updatedAt: number | null;
  createdAt: number | null;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const services = getFirebaseServices();
  if (!services) return [];

  const user = await ensureUser();
  if (!user) return [];

  const snapshot = await getDocs(query(usersProjectsPath(user.uid), orderBy('updatedAt', 'desc'), limit(50)));
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as PersistedProjectDoc;
    return {
      projectId: docSnapshot.id,
      projectName: data.name,
      status: data.status,
      updatedAt: data.updatedAt,
      createdAt: data.createdAt,
    };
  });
}

export async function switchProject(projectId: string): Promise<boolean> {
  const services = getFirebaseServices();
  if (!services) return false;

  const user = await ensureUser();
  if (!user) return false;

  const activeProjectId = useCoreStore.getState().projectId;
  if (activeProjectId === projectId) return true;

  // Flush the currently active project/run before switching away from it.
  if (activeProjectId) {
    await persistState(user.uid).catch((error) => {
      console.error('[FirestorePersistence] Failed to flush current project before switching.', error);
    });
  }

  const projectSnapshot = await getDoc(projectRef(user.uid, projectId));
  if (!projectSnapshot.exists()) return false;

  const projectData = projectSnapshot.data() as PersistedProjectDoc;
  const runData = await loadRunDoc(user.uid, projectId, projectData.currentRunId);
  hydrateFromFirestore(projectData, runData);
  return true;
}

export async function switchActiveRun(runId: string): Promise<boolean> {
  const services = getFirebaseServices();
  if (!services) return false;

  const user = await ensureUser();
  if (!user) return false;

  const currentProjectId = useCoreStore.getState().projectId;
  if (!currentProjectId) return false;

  const projectSnapshot = await getDoc(projectRef(user.uid, currentProjectId));
  if (!projectSnapshot.exists()) return false;

  const projectData = projectSnapshot.data() as PersistedProjectDoc;
  const selectedRunData = await loadRunDoc(user.uid, currentProjectId, runId);
  if (!selectedRunData) return false;

  await setDoc(projectRef(user.uid, currentProjectId), {
    currentRunId: runId,
    updatedAt: Date.now(),
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true });

  hydrateFromFirestore({ ...projectData, currentRunId: runId }, selectedRunData);
  return true;
}
