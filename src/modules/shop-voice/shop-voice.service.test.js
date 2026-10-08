const mockGetEffectivePlan = jest.fn();
jest.mock('../shop-status/shop-status.service', () => ({ getEffectivePlan: mockGetEffectivePlan }));

const mockCountVoiceInvoices = jest.fn();
jest.mock('../../utils/voiceQuota', () => ({ countVoiceInvoices: mockCountVoiceInvoices }));

const { checkVoiceInvoiceQuota } = require('./shop-voice.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkVoiceInvoiceQuota', () => {
  test('a plan with no voiceInvoiceLimit (null) is never blocked, however many voice invoices exist', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Pro', voiceInvoiceLimit: null } });
    mockCountVoiceInvoices.mockResolvedValue(10000);

    await expect(checkVoiceInvoiceQuota('shop-1')).resolves.toBeUndefined();
  });

  test('a shop with no effective plan at all (locked out) is never blocked here — requireActiveShop is the real gate for that', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: null });

    await expect(checkVoiceInvoiceQuota('shop-1')).resolves.toBeUndefined();
    expect(mockCountVoiceInvoices).not.toHaveBeenCalled();
  });

  test('usage below the limit is allowed', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Basic', voiceInvoiceLimit: 50 } });
    mockCountVoiceInvoices.mockResolvedValue(49);

    await expect(checkVoiceInvoiceQuota('shop-1')).resolves.toBeUndefined();
  });

  test('usage at the limit is rejected with a 403 naming the real plan and number', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Basic', voiceInvoiceLimit: 50 } });
    mockCountVoiceInvoices.mockResolvedValue(50);

    await expect(checkVoiceInvoiceQuota('shop-1')).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('Basic plan is limited to 50 voice-created invoices'),
    });
  });

  test('a plan with voiceInvoiceLimit of 0 blocks even a shop with zero voice invoices so far', async () => {
    mockGetEffectivePlan.mockResolvedValue({ effectivePlan: { name: 'Trial', voiceInvoiceLimit: 0 } });
    mockCountVoiceInvoices.mockResolvedValue(0);

    await expect(checkVoiceInvoiceQuota('shop-1')).rejects.toMatchObject({ status: 403 });
  });
});
