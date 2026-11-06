import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import {
  listTrustedDevices,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
} from '../../api/trustedDevices';
import { errorDetail } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, Skeleton, useToast } from '../ui';

/** Profile: devices that skip the emailed code at sign-in, with Forget one / Forget all. */
export function TrustedDevicesCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['trusted-devices'], queryFn: listTrustedDevices });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['trusted-devices'] });
  const fail = (error: unknown) =>
    toast.show({
      tone: 'danger',
      title: 'Could not forget the device',
      description: errorDetail(error) ?? 'Please try again.',
    });
  const forgetOne = useMutation({
    mutationFn: (id: string) => revokeTrustedDevice(id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Device forgotten' });
    },
    onError: fail,
  });
  const forgetAll = useMutation({
    mutationFn: revokeAllTrustedDevices,
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'All devices forgotten' });
    },
    onError: fail,
  });
  const list = devices.data ?? [];
  return (
    <Card variant="plain" padding="lg" as="section" aria-label="Trusted devices" className="h-fit">
      <h2 className="text-base font-semibold text-text">Trusted devices</h2>
      <p className="mt-1 text-sm text-text-muted">
        On these devices you skip the emailed code when you sign in with your password. Sensitive
        changes, such as a new password, still ask for a fresh code.
      </p>
      {devices.isPending ? (
        <Skeleton className="mt-md h-12 w-full" />
      ) : devices.isError ? (
        <p className="mt-md text-sm text-danger-text">We couldn&apos;t load your devices.</p>
      ) : list.length === 0 ? (
        <p className="mt-md text-sm text-text-muted">
          No remembered devices. Tick &ldquo;Remember this device for 30 days&rdquo; when you sign
          in to add one.
        </p>
      ) : (
        <>
          <ul className="mt-md flex flex-col gap-sm">
            {list.map((device) => (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded-nested bg-surface-muted px-md py-sm"
              >
                <div className="flex min-w-0 items-start gap-sm">
                  <MonitorSmartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">
                      {device.label}{' '}
                      {device.this_device && <Badge tone="primary">This device</Badge>}
                    </p>
                    <p className="text-xs text-text-muted">
                      {device.last_used_at
                        ? `Last used ${formatDateTime(device.last_used_at)}`
                        : 'Not used yet'}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Forget ${device.label}`}
                  loading={forgetOne.isPending && forgetOne.variables === device.id}
                  onClick={() => forgetOne.mutate(device.id)}
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
          {list.length > 1 && (
            <Button
              className="mt-md"
              size="sm"
              variant="secondary"
              loading={forgetAll.isPending}
              onClick={() => forgetAll.mutate()}
            >
              Forget all devices
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
