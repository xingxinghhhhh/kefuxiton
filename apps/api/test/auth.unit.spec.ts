import { TestStaffIdentityAdapter } from '../src/modules/auth/test-staff-identity.adapter.js';

describe('test staff identity adapter', () => {
  const previousMode = process.env.STAFF_AUTH_MODE;
  const previousToken = process.env.AI_AGENT_TEST_STAFF_TOKEN;

  afterEach(() => {
    if (previousMode === undefined) delete process.env.STAFF_AUTH_MODE;
    else process.env.STAFF_AUTH_MODE = previousMode;
    if (previousToken === undefined) delete process.env.AI_AGENT_TEST_STAFF_TOKEN;
    else process.env.AI_AGENT_TEST_STAFF_TOKEN = previousToken;
  });

  it('accepts only the explicit test mode and configured token', () => {
    const adapter = new TestStaffIdentityAdapter();
    process.env.STAFF_AUTH_MODE = 'test';
    process.env.AI_AGENT_TEST_STAFF_TOKEN = 'unit-only-token';
    expect(adapter.authenticate('Staff wrong-token')).toBeNull();
    expect(adapter.authenticate('Staff unit-only-token')?.permissions).toContain('handoff:claim');
  });

  it('denies by default outside explicit test mode', () => {
    const adapter = new TestStaffIdentityAdapter();
    delete process.env.STAFF_AUTH_MODE;
    process.env.AI_AGENT_TEST_STAFF_TOKEN = 'unit-only-token';
    expect(adapter.authenticate('Staff unit-only-token')).toBeNull();
  });
});
