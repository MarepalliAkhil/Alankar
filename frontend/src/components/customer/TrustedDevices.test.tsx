import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/trustedDevices';
import { ToastProvider } from '../ui';
import { OtpStep } from '../auth/OtpStep';
import { FreshCodeModal } from '../auth/FreshCodeModal';
import { TrustedDevicesCard } from './TrustedDevicesCard';

vi.mock('../../api/trustedDevices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/trustedDevices')>()),
  listTrustedDevices: vi.fn(),
  revokeTrustedDevice: vi.fn(),
  revokeAllTrustedDevices: vi.fn(),
  startStepUp: vi.fn(),
  verifyStepUp: vi.fn(),
}));
vi.mock('../../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/auth')>()),
  resendOtp: vi.fn(),
}));

const phone = {
  id: 'd1',
  label: 'Chrome on Android',
  created_at: '2026-10-01T05:00:00Z',
  last_used_at: '2026-10-20T05:00:00Z',
  expires_at: '2026-10-31T05:00:00Z',
  this_device: false,
};
const laptop = { ...phone, id: 'd2', label: 'Firefox on Windows', this_device: true };

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>{node}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listTrustedDevices).mockResolvedValue([phone, laptop]);
  vi.mocked(api.revokeTrustedDevice).mockResolvedValue();
  vi.mocked(api.revokeAllTrustedDevices).mockResolvedValue();
  vi.mocked(api.startStepUp).mockResolvedValue({
    required: true,
    method: 'email',
    detail: 'We emailed you a 6-digit code.',
  });
  vi.mocked(api.verifyStepUp).mockResolvedValue();
});

describe('trusted devices', () => {
  it('lists devices with last use, marks this one, and forgets one or all', async () => {
    const user = userEvent.setup();
    wrap(<TrustedDevicesCard />);
    expect(await screen.findByText('Chrome on Android')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.getAllByText(/Last used/)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Forget Chrome on Android' }));
    await waitFor(() => expect(api.revokeTrustedDevice).toHaveBeenCalledWith('d1'));
    await user.click(screen.getByRole('button', { name: 'Forget all devices' }));
    await waitFor(() => expect(api.revokeAllTrustedDevices).toHaveBeenCalled());
  });

  it('explains how to add one when the list is empty', async () => {
    vi.mocked(api.listTrustedDevices).mockResolvedValue([]);
    wrap(<TrustedDevicesCard />);
    expect(await screen.findByText(/No remembered devices/)).toBeInTheDocument();
  });
});

describe('remember this device at sign-in', () => {
  it('is unchecked by default, warns about shared devices, and sends the choice', async () => {
    const onVerify = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(
      <OtpStep
        email="a@b.com"
        purpose="login"
        message="Code sent"
        onVerify={onVerify}
        onBack={() => {}}
        offerRemember
      />,
    );
    const box = screen.getByLabelText('Remember this device for 30 days');
    expect(box).not.toBeChecked();
    expect(screen.getByText('Only use on your own device.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/6-digit code/), '123456');
    await user.click(box);
    await user.click(screen.getByRole('button', { name: /Continue|Verify|Sign in|Confirm|Check/ }));
    await waitFor(() => expect(onVerify).toHaveBeenCalledWith('123456', true));
  });

  it('does not offer the box when registering', () => {
    wrap(
      <OtpStep
        email="a@b.com"
        purpose="register"
        message="Code sent"
        onVerify={vi.fn()}
        onBack={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Remember this device for 30 days')).toBeNull();
  });
});

describe('fresh code for sensitive actions', () => {
  it('sends a code, checks it, then lets the action continue', async () => {
    const onVerified = vi.fn();
    const user = userEvent.setup();
    wrap(<FreshCodeModal onVerified={onVerified} onCancel={() => {}} />);
    expect(await screen.findByText('We emailed you a 6-digit code.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Code/), '654321');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(api.verifyStepUp).toHaveBeenCalledWith('654321'));
    expect(onVerified).toHaveBeenCalled();
  });

  it('keeps the action blocked when the code is wrong', async () => {
    vi.mocked(api.verifyStepUp).mockRejectedValue(new Error('bad'));
    const onVerified = vi.fn();
    const user = userEvent.setup();
    wrap(<FreshCodeModal onVerified={onVerified} onCancel={() => {}} />);
    await user.type(await screen.findByLabelText(/^Code/), '000000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText(/incorrect or has expired|Please try again/),
    ).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });
});
