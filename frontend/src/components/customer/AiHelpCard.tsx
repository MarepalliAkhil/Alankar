import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAirConsent, setAirConsent } from '../../api/air';
import { errorDetail } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';
import { LoaderSlot } from '../brand/LogoLoader';
import { Button, Card, useToast } from '../ui';

/**
 * Profile > Privacy: the customer's consent for AI help in the chat (AIR Task 2). Turning it off
 * stops every AI call at once; the chat keeps working in basic mode.
 */
export function AiHelpCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const consent = useQuery({ queryKey: ['air-consent'], queryFn: getAirConsent });
  const change = useMutation({
    mutationFn: (granted: boolean) => setAirConsent(granted),
    onSuccess: (data) => {
      queryClient.setQueryData(['air-consent'], data);
      toast.show({
        tone: 'success',
        title: data.granted ? 'AI help is on' : 'AI help is off',
      });
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not save',
        description: errorDetail(error) ?? 'Please try again.',
      }),
  });

  const data = consent.data;
  const loaderShown = useDelayedLoading(consent.isPending);
  return (
    <Card as="section" aria-label="Privacy: AI help in chat">
      <h2 className="text-lg font-semibold text-text">Privacy: AI help in chat</h2>
      {consent.isPending || loaderShown ? (
        <p className="mt-1 flex items-center gap-2 text-sm text-text-muted">
          <LoaderSlot visible={loaderShown} label="Loading the setting" />
          Loading…
        </p>
      ) : consent.isError || !data ? (
        <p className="mt-1 text-sm text-text-muted">We couldn&apos;t load this setting.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-text-muted">{data.text}</p>
          <p className="mt-sm text-sm text-text">
            {data.granted && data.granted_at
              ? `On since ${formatDateTime(data.granted_at)}.`
              : 'Off. The chat works in basic mode and never sends your messages to an AI service.'}
          </p>
          <div className="mt-md">
            <Button
              type="button"
              variant="secondary"
              loading={change.isPending}
              onClick={() => change.mutate(!data.granted)}
            >
              {data.granted ? 'Turn AI help off' : 'Turn AI help on'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
