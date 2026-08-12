import { TraceRecorder } from '../src/trace-recorder.js';

describe('N19 trace determinism and sequence invariants', () => {
  it('uses fixed sequence numbers and suppresses duplicate node events per phase', () => {
    const first = new TraceRecorder('deterministic-trace', 'deterministic-thread');
    first.recordRunStarted();
    first.recordNodeEntered('classify_request');
    first.recordNodeEntered('classify_request');
    first.recordNodeCompleted('classify_request', null);
    first.recordNodeCompleted('classify_request', null);
    first.recordTerminal('completed', 'not_started', 'safe_refusal');

    const second = new TraceRecorder('deterministic-trace', 'deterministic-thread');
    second.recordRunStarted();
    second.recordNodeEntered('classify_request');
    second.recordNodeCompleted('classify_request', null);
    second.recordTerminal('completed', 'not_started', 'safe_refusal');

    expect(first.build()).toEqual(second.build());
    expect(first.build().events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(first.build().auditSummary).toMatchObject({ eventCount: 4, lastSequence: 4, pauseCount: 0, resumeCount: 0, rejectedResumeCount: 0 });
  });

  it('rejects identifiers that could carry paths or secrets', () => {
    expect(() => new TraceRecorder('C:\\secret\\trace', 'thread')).toThrow();
    expect(() => new TraceRecorder('trace', 'operator@example.com/secret')).toThrow();
  });
});
