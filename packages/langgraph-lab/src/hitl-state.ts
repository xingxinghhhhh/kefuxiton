import type { ResponseType } from '@ai-agent/contracts';
import { Annotation } from '@langchain/langgraph';
import type {
  AgentResultCompat,
  KnowledgeSafetyResult,
  RequestPolicyDecision,
  RetrievedKnowledgeResult,
} from './state.js';

export const HANDOFF_REVIEW_REASON = 'HUMAN_REVIEW_REQUIRED' as const;
export const MISSING_RESUME_MARKER = { kind: 'n18_missing_resume' } as const;

export type HumanDecisionKind = 'approve_handoff' | 'deny_handoff';
export type ResumeStatus = 'not_started' | 'paused' | 'approved' | 'denied' | 'invalid' | 'duplicate' | 'stale';
export type TerminalOutcome = 'handoff_recommended' | 'safe_refusal' | 'safe_unavailable' | 'knowledge_answer' | 'mock_fallback';
export type HitlErrorCode =
  | 'HUMAN_DECISION_MISSING'
  | 'HUMAN_DECISION_INVALID'
  | 'HUMAN_RESUME_DUPLICATE'
  | 'HUMAN_RESUME_STALE'
  | 'HITL_RESULT_MISSING';
export type HitlPath =
  | 'injection'
  | 'handoff'
  | 'inspect_knowledge'
  | 'no_match'
  | 'unsafe_knowledge'
  | 'knowledge_answer'
  | 'mock_fallback'
  | 'prepare_handoff_pause'
  | 'request_human_decision'
  | 'validate_human_decision'
  | 'safe_refusal'
  | 'handoff_recommended'
  | 'safe_unavailable'
  | 'fail_closed';

export interface HandoffInterruptPayload {
  kind: 'handoff_review_required';
  schemaVersion: 'n18.v1';
  reasonCode: typeof HANDOFF_REVIEW_REASON;
  allowedDecisions: readonly [HumanDecisionKind, HumanDecisionKind];
}

export interface HumanDecision {
  decision: HumanDecisionKind;
  decisionVersion: 1;
}

export interface HitlGraphState {
  inputContent: string;
  policyDecision?: RequestPolicyDecision;
  retrievalResult?: RetrievedKnowledgeResult;
  knowledgeSafetyResult?: KnowledgeSafetyResult;
  path?: HitlPath;
  handoffPause?: HandoffInterruptPayload;
  humanDecision?: HumanDecision;
  resumeStatus?: ResumeStatus;
  terminalOutcome?: TerminalOutcome;
  result?: AgentResultCompat;
  errorCode?: HitlErrorCode;
}

export const HitlStateAnnotation = Annotation.Root({
  inputContent: Annotation<string>(),
  policyDecision: Annotation<RequestPolicyDecision | undefined>(),
  retrievalResult: Annotation<RetrievedKnowledgeResult | undefined>(),
  knowledgeSafetyResult: Annotation<KnowledgeSafetyResult | undefined>(),
  path: Annotation<HitlPath | undefined>(),
  handoffPause: Annotation<HandoffInterruptPayload | undefined>(),
  humanDecision: Annotation<HumanDecision | undefined>(),
  resumeStatus: Annotation<ResumeStatus | undefined>(),
  terminalOutcome: Annotation<TerminalOutcome | undefined>(),
  result: Annotation<AgentResultCompat | undefined>(),
  errorCode: Annotation<HitlErrorCode | undefined>(),
});

export type HitlGraphStateFromAnnotation = typeof HitlStateAnnotation.State;
export type HitlGraphUpdate = typeof HitlStateAnnotation.Update;

export interface HitlRunResult {
  runStatus: 'paused' | 'completed' | 'rejected';
  threadId: string;
  interruptPayload?: HandoffInterruptPayload;
  result: AgentResultCompat | null;
  resumeStatus: ResumeStatus;
  terminalOutcome?: TerminalOutcome;
  errorCode?: HitlErrorCode;
  path?: HitlPath;
}

export function createHandoffInterruptPayload(): HandoffInterruptPayload {
  return {
    kind: 'handoff_review_required',
    schemaVersion: 'n18.v1',
    reasonCode: HANDOFF_REVIEW_REASON,
    allowedDecisions: ['approve_handoff', 'deny_handoff'],
  };
}

export function parseHumanDecision(value: unknown): HumanDecision | undefined {
  if (isMissingResumeValue(value)) return undefined;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'decision' || keys[1] !== 'decisionVersion') return undefined;
  if ((value.decision !== 'approve_handoff' && value.decision !== 'deny_handoff') || value.decisionVersion !== 1) {
    return undefined;
  }
  return { decision: value.decision, decisionVersion: 1 };
}

export function isMissingResumeValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return isRecord(value) && Object.keys(value).length === 1 && value.kind === MISSING_RESUME_MARKER.kind;
}

export function isHandoffInterruptPayload(value: unknown): value is HandoffInterruptPayload {
  if (!isRecord(value)) return false;
  return (
    value.kind === 'handoff_review_required' &&
    value.schemaVersion === 'n18.v1' &&
    value.reasonCode === HANDOFF_REVIEW_REASON &&
    Array.isArray(value.allowedDecisions) &&
    value.allowedDecisions.length === 2 &&
    value.allowedDecisions[0] === 'approve_handoff' &&
    value.allowedDecisions[1] === 'deny_handoff'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function responseTypeForOutcome(outcome: TerminalOutcome): ResponseType {
  if (outcome === 'handoff_recommended') return 'handoff_recommended';
  if (outcome === 'knowledge_answer') return 'knowledge_answer';
  if (outcome === 'mock_fallback') return 'mock_fallback';
  return 'safe_unavailable';
}
