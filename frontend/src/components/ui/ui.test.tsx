import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { appointmentStatuses, appointmentStatusLabels } from '../../types/appointment';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { PasswordInput } from './PasswordInput';
import { StatusBadge } from './StatusBadge';
import { Tabs } from './Tabs';

describe('ui components', () => {
  it('Modal closes on Escape and on the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose} title="Confirm booking">
        Body
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm booking' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Modal renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        Body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('StatusBadge has a readable label for every status', () => {
    render(
      <>
        {appointmentStatuses.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    );
    for (const status of appointmentStatuses) {
      expect(screen.getByText(appointmentStatusLabels[status])).toBeInTheDocument();
    }
  });

  it('PasswordInput toggles visibility', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('Tabs support arrow-key navigation', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Tabs
        items={[
          { id: 'a', label: 'First' },
          { id: 'b', label: 'Second' },
        ]}
        value="a"
        onChange={onChange}
        label="Demo"
        idPrefix="t"
      />,
    );
    screen.getByRole('tab', { name: 'First' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Avatar falls back to initials', () => {
    render(<Avatar name="Priya Sharma" />);
    expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveTextContent('PS');
  });
});
