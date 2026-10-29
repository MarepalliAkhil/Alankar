import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { errorDetail } from '../../api/client';
import {
  getGiftCard,
  listGiftCards,
  revealGiftCardCode,
  voidGiftCard,
  type GiftCardRow,
} from '../../api/wallet';
import { ReasonModal } from '../../components/admin/wallet/ReasonModal';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINRExact } from '../../lib/format';

function stateOf(card: GiftCardRow): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (card.status === 'void') return { label: 'Cancelled', tone: 'neutral' };
  if (card.expired) return { label: 'Expired', tone: 'warning' };
  if (Number(card.balance) <= 0) return { label: 'Used up', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

/** Admin: gift cards. Full codes are never shown; only the last four characters. */
export default function GiftCardsPage() {
  useDocumentTitle('Gift Cards');
  const toast = useToast();
  const queryClient = useQueryClient();
  const cards = useQuery({ queryKey: ['w-cards'], queryFn: listGiftCards });
  const [viewing, setViewing] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<GiftCardRow | null>(null);
  const [problem, setProblem] = useState('');
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [revealProblem, setRevealProblem] = useState('');
  const detail = useQuery({
    queryKey: ['w-card', viewing],
    queryFn: () => getGiftCard(viewing as string),
    enabled: viewing !== null,
  });
  const cancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) => voidGiftCard(v.id, v.reason),
    onSuccess: () => {
      setVoiding(null);
      void queryClient.invalidateQueries({ queryKey: ['w-cards'] });
      void queryClient.invalidateQueries({ queryKey: ['w-card'] });
      toast.show({ tone: 'success', title: 'Gift card cancelled' });
    },
    onError: (e) => setProblem(errorDetail(e) ?? 'Could not cancel the card.'),
  });
  const reveal = useMutation({
    mutationFn: (id: string) => revealGiftCardCode(id),
    onSuccess: (r) => setRevealedCode(r.code),
    onError: (e) =>
      setRevealProblem(errorDetail(e) ?? "This card's code was only shown once, when issued."),
  });
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Gift Cards"
        description="Codes are shown once to the buyer and emailed to the recipient. If a card is lost, cancel it here and sell a new one."
      />
      <Card variant="dense" as="section" aria-label="Gift cards">
        {cards.isPending ? (
          <LoadingState label="Loading gift cards…" />
        ) : cards.isError ? (
          <ErrorState
            description="We couldn't load the gift cards."
            onRetry={() => void cards.refetch()}
          />
        ) : cards.data.length === 0 ? (
          <EmptyState
            title="No gift cards sold yet"
            description="Cards sold at the counter or online appear here."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {cards.data.map((c) => {
              const state = stateOf(c);
              return (
                <li key={c.id} className="rounded-nested border border-border p-md">
                  <div className="flex flex-wrap items-center gap-xs">
                    <p className="font-mono font-semibold text-text">{c.masked}</p>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span className="text-sm text-text-muted">
                      {formatINRExact(c.balance)} left of {formatINRExact(c.initial_amount)}
                    </span>
                  </div>
                  <p className="mt-xs text-xs text-text-muted">
                    Bought by {c.buyer_name || 'a guest'} (
                    {c.channel === 'online' ? 'online' : 'counter'}, {c.sale_number}) · expires{' '}
                    {formatDateTime(c.expires_at)}
                    {c.recipient_name ? ` · for ${c.recipient_name}` : ''}
                  </p>
                  <div className="mt-sm flex flex-wrap gap-sm">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRevealedCode(null);
                        setRevealProblem('');
                        setViewing(c.id);
                      }}
                    >
                      History
                    </Button>
                    {c.status === 'active' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setProblem('');
                          setVoiding(c);
                        }}
                      >
                        Cancel card
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {viewing && (
        <Modal
          open
          onClose={() => {
            setViewing(null);
            setRevealedCode(null);
            setRevealProblem('');
          }}
          title="Gift card history"
        >
          {detail.isPending ? (
            <LoadingState label="Loading history…" />
          ) : detail.isError ? (
            <ErrorState
              description="We couldn't load the history."
              onRetry={() => void detail.refetch()}
            />
          ) : (
            <div className="flex flex-col gap-sm">
              <div className="flex flex-wrap items-center gap-sm">
                <p className="font-mono font-semibold text-text">
                  {revealedCode ?? detail.data.masked}
                </p>
                {detail.data.code_available ? (
                  !revealedCode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRevealProblem('');
                        reveal.mutate(detail.data.id);
                      }}
                      disabled={reveal.isPending}
                    >
                      <Eye className="size-4" aria-hidden /> Reveal full code
                    </Button>
                  )
                ) : (
                  <span className="text-xs text-text-muted">Code was shown once, at purchase</span>
                )}
              </div>
              {revealProblem && <p className="text-sm text-danger">{revealProblem}</p>}
              <ul className="flex flex-col gap-1 text-sm" aria-label="Card history">
                {(detail.data.ledger ?? []).map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-xs">
                    <span className="text-text-muted">
                      {formatDateTime(e.created_at)} · {e.reason_label}
                      {e.note ? ` (${e.note})` : ''}
                    </span>
                    <span className="font-medium text-text">{formatINRExact(e.delta)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}
      {voiding && (
        <ReasonModal
          title={`Cancel card ${voiding.masked}`}
          description="The balance is set to zero and the code stops working. This cannot be undone."
          confirmLabel="Cancel card"
          busy={cancel.isPending}
          problem={problem}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) => cancel.mutate({ id: voiding.id, reason })}
        />
      )}
    </div>
  );
}
