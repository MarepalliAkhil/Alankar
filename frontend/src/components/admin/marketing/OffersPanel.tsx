import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createOffer,
  deleteOffer,
  listOffers,
  updateOffer,
  type OfferInput,
  type OfferRow,
} from '../../../api/marketing';
import { errorDetail, serverFieldErrors } from '../../../api/client';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Textarea,
  useToast,
} from '../../ui';

/** Offers are the promotions shown on the public home page. Coupons are what the till accepts. */
export function OffersPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const offers = useQuery({ queryKey: ['mk-offers'], queryFn: listOffers });
  const [editing, setEditing] = useState<OfferRow | 'new' | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['mk-offers'] });
    void queryClient.invalidateQueries({ queryKey: ['site'] });
  };
  const flip = useMutation({
    mutationFn: (o: OfferRow) => updateOffer(o.id, { is_active: !o.is_active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (o: OfferRow) => deleteOffer(o.id),
    onSuccess: () => {
      refresh();
      toast.show({ tone: 'success', title: 'Offer deleted' });
    },
  });
  return (
    <Card variant="dense" as="section" aria-label="Offers">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Offers on the website</h2>
          <p className="mt-1 text-sm text-text-muted">Shown on the home page until the end date.</p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> Add an offer
        </Button>
      </div>
      <div className="mt-md">
        {offers.isPending ? (
          <LoadingState label="Loading offers…" />
        ) : offers.isError ? (
          <ErrorState
            description="We couldn't load the offers."
            onRetry={() => void offers.refetch()}
          />
        ) : offers.data.length === 0 ? (
          <EmptyState title="No offers yet" description="Add one to show it on the home page." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {offers.data.map((o) => (
              <li key={o.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-medium text-text">{o.title}</p>
                  {o.badge && <Badge tone="primary">{o.badge}</Badge>}
                  <Badge tone={o.is_active ? 'success' : 'neutral'}>
                    {o.is_active ? 'Live' : 'Off'}
                  </Badge>
                  {o.valid_until && <Badge tone="info">Until {o.valid_until}</Badge>}
                </div>
                <p className="mt-xs text-sm text-text-muted">{o.description}</p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(o)}>
                    Edit
                  </Button>
                  <Button
                    loading={flip.isPending && flip.variables?.id === o.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => flip.mutate(o)}
                  >
                    {o.is_active ? 'Switch off' : 'Switch on'}
                  </Button>
                  <Button
                    loading={remove.isPending && remove.variables?.id === o.id}
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => remove.mutate(o)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <OfferForm
          offer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function OfferForm({
  offer,
  onClose,
  onSaved,
}: {
  offer: OfferRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    badge: offer?.badge ?? '',
    valid_until: offer?.valid_until ?? '',
    is_active: offer?.is_active ?? true,
  });
  const [problem, setProblem] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: OfferInput) => (offer ? updateOffer(offer.id, body) : createOffer(body)),
    onSuccess: () => {
      toast.show({ tone: 'success', title: offer ? 'Offer saved' : 'Offer added' });
      onSaved();
    },
    onError: (error) => {
      const server = serverFieldErrors(error);
      setFields(server);
      setProblem(
        Object.keys(server).length
          ? 'Check the highlighted fields.'
          : (errorDetail(error) ?? 'Could not save.'),
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.title.trim().length < 3 || form.description.trim().length < 3) {
      return setProblem('Give the offer a title and a description.');
    }
    save.mutate({ ...form, valid_until: form.valid_until || null });
  };
  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title={offer ? 'Edit offer' : 'Add an offer'}
      size="md"
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Input
          label="Title"
          value={form.title}
          maxLength={120}
          error={fields.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <Textarea
          label="Description"
          value={form.description}
          error={fields.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Input
          label="Badge"
          hint="Short label such as 20% off. Optional."
          value={form.badge}
          maxLength={30}
          onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
        />
        <Input
          label="Valid until"
          type="date"
          hint="Leave empty for no end date."
          value={form.valid_until}
          error={fields.valid_until}
          onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
        />
        <Checkbox
          label="Show on the website"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
