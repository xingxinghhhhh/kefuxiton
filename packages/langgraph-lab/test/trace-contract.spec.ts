import {
  N19_ERROR_CODES,
  N19_SCHEMA_VERSION,
  TRACE_NODES,
  TRACE_ROUTES,
  isN19ErrorCode,
  isTraceNode,
  isTraceRoute,
} from '../src/trace-contract.js';

describe('N19 trace contract', () => {
  it('exposes fixed versioned enums and rejects unknown values', () => {
    expect(N19_SCHEMA_VERSION).toBe('n19.v1');
    expect(TRACE_NODES).toContain('request_human_decision');
    expect(TRACE_ROUTES).toContain('unsafe_knowledge');
    expect(N19_ERROR_CODES).toContain('SENSITIVE_DATA_REJECTED');
    expect(isTraceNode('knowledge_answer')).toBe(true);
    expect(isTraceNode('unsafe_knowledge')).toBe(false);
    expect(isTraceRoute('unsafe_knowledge')).toBe(true);
    expect(isTraceRoute('unknown_route')).toBe(false);
    expect(isN19ErrorCode('RETRIEVAL_INVALID')).toBe(true);
    expect(isN19ErrorCode('CUSTOM_ERROR')).toBe(false);
  });
});
