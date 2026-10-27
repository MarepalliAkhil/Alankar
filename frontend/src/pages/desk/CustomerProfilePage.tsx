import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import { classifyError } from '../../api/client';
import {
  addCustomerNote,
  editCustomer,
  getCustomer,
  type CustomerDetail,
  type CustomerVisit,
} from '../../api/customers';
import { DeskBookingDrawer } from '../../components/desk/DeskBookingDrawer';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime, formatINR } from '../../lib/format';

const sourceLabels: Record<string, string> = {
  online: 'Online',
  walk_in: 'Walk-in',
  phone: 'Phone',
};

/** One customer: contact details, allergies, visit history and front-desk notes. */
export default function CustomerProfilePage() {
  const { id = '' } = useParams();
  useDocumentTitle('Customer');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);

  const customer = useQuery({
    queryKey: ['desk-customer', id],
    queryFn: () => getCustomer(id),
    retry: (count, error) => classifyError(error) !== 'not_found' && count < 1,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['desk-customer', id] });
    void queryClient.invalidateQueries({ queryKey: ['desk-customers'] });
    void queryClient.invalidateQueries({ queryKey: ['desk-appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['desk-schedule'] });
  };

  if (customer.isPending) return <LoadingState label="Loading customer…" />;
  if (customer.isError) {
    return classifyError(customer.error) === 'not_found' ? (
      <EmptyState
        title="Customer not found"
        description="This customer does not exist or was removed."
        action={
          <Link to="/customers" className="text-sm font-medium text-primary-hover underline">
            Back to customers
          </Link>
        }
      />
    ) : (
      <ErrorState
        description="We couldn't load this customer."
        onRetry={() => void customer.refetch()}
      />
    );
  }

  const data = customer.data;
  return (
    <section className="flex flex-col gap-lg">
      <Link
        to="/customers"
        className="inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-primary-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All customers
      </Link>
      <PageHeader
        title={data.full_name || data.email}
        description={`${data.email} · ${data.phone}`}
        actions={
          <>
            <Button
              leftIcon={<CalendarPlus className="h-4 w-4" />}
              onClick={() => setBooking(true)}
            >
              Book a visit
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditing(true)}
            >
              Edit details
            </Button>
          </>
        }
      />

      {data.allergies && (
        <p className="rounded-nested bg-warning-soft px-md py-sm text-sm text-text">
          <span className="font-semibold">Allergies:</span> {data.allergies}
        </p>
      )}
      {data.stats.pending_ratings > 0 && (
        <p className="rounded-nested bg-surface-muted px-md py-sm text-sm text-text-muted">
          This customer has {data.stats.pending_ratings} visit
          {data.stats.pending_ratings === 1 ? '' : 's'} to rate. Online booking stays closed until
          they rate.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-md sm:grid-cols-4">
        <Stat label="Visits" value={String(data.stats.visits)} />
        <Stat
          label="Last visit"
          value={data.stats.last_visit ? formatDateTime(data.stats.last_visit) : '—'}
        />
        <Stat
          label="Next visit"
          value={data.stats.next_visit ? formatDateTime(data.stats.next_visit) : '—'}
        />
        <Stat
          label="No-shows / cancellations"
          value={`${data.stats.no_shows} / ${data.stats.cancellations}`}
        />
      </dl>

      {data.preferences && (
        <Card variant="plain" padding="md">
          <h2 className="text-sm font-semibold text-text">Preferences</h2>
          <p className="mt-1 text-sm text-text-muted">{data.preferences}</p>
        </Card>
      )}

      <div className="grid gap-lg lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="visit-history" className="flex flex-col gap-md">
          <h2 id="visit-history" className="text-lg font-semibold text-text">
            Visit history
          </h2>
          {data.visits_list.length === 0 ? (
            <EmptyState
              title="No visits yet"
              description="Book a walk-in or phone visit to start this customer's history."
            />
          ) : (
            <ul className="flex flex-col gap-sm">
              {data.visits_list.map((visit) => (
                <VisitRow key={visit.id} visit={visit} />
              ))}
            </ul>
          )}
        </section>
        <NotesPanel customer={data} onChanged={refresh} />
      </div>

      {editing && (
        <EditModal
          customer={data}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {booking && (
        <DeskBookingDrawer
          customer={data}
          onClose={() => setBooking(false)}
          onDone={() => {
            setBooking(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="plain" padding="sm">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-text">{value}</dd>
    </Card>
  );
}

function VisitRow({ visit }: { visit: CustomerVisit }) {
  return (
    <li>
      <Card variant="plain" padding="sm" className="flex flex-wrap items-center gap-md">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {visit.service_name}
            {visit.variant_label ? ` · ${visit.variant_label}` : ''}
          </p>
          <p className="text-xs text-text-muted">
            {visit.start ? formatDateTime(visit.start) : 'No time set'}
            {visit.stylist_name ? ` · ${visit.stylist_name}` : ''} ·{' '}
            {sourceLabels[visit.source] ?? visit.source}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={visit.status} />
          <span className="text-xs text-text-muted">
            {formatINR(visit.amount)}
            {visit.invoice_number ? ` · ${visit.invoice_number}` : ''}
          </span>
        </div>
      </Card>
    </li>
  );
}

function NotesPanel({ customer, onChanged }: { customer: CustomerDetail; onChanged: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState('');
  const add = useMutation({
    mutationFn: () => addCustomerNote(customer.id, body.trim()),
    onSuccess: () => {
      setBody('');
      onChanged();
      toast.show({ tone: 'success', title: 'Note added' });
    },
    onError: (error) => setProblem(genericErrorMessage(error, 'Could not add the note.')),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (body.trim().length < 2) {
      setProblem('Write a short note.');
      return;
    }
    setProblem('');
    add.mutate();
  };
  return (
    <section aria-labelledby="front-desk-notes" className="flex flex-col gap-md">
      <h2 id="front-desk-notes" className="text-lg font-semibold text-text">
        Front-desk notes <Badge tone="neutral">Staff only</Badge>
      </h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-sm">
        <Textarea
          label="Add a note"
          maxLength={1000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          error={problem}
        />
        <div>
          <Button type="submit" size="sm" loading={add.isPending}>
            Save note
          </Button>
        </div>
      </form>
      {customer.notes.length === 0 ? (
        <p className="text-sm text-text-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {customer.notes.map((note) => (
            <li key={note.id}>
              <Card variant="plain" padding="sm">
                <p className="whitespace-pre-wrap text-sm text-text">{note.body}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {note.author_name} · {formatDateTime(note.created_at)}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const mobile = /^(\+?91)?[\s-]?[6-9]\d{4}[\s-]?\d{5}$/;

function EditModal({
  customer,
  onClose,
  onDone,
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(customer.full_name);
  const [phone, setPhone] = useState(customer.phone);
  const [allergies, setAllergies] = useState(customer.allergies);
  const [preferences, setPreferences] = useState(customer.preferences);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: () =>
      editCustomer(customer.id, {
        full_name: name.trim(),
        phone: phone.trim(),
        allergies: allergies.trim(),
        preferences: preferences.trim(),
      }),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Details saved' });
      onDone();
    },
    onError: (error) => setProblem(genericErrorMessage(error, 'Could not save. Please try again.')),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter the full name.';
    if (!mobile.test(phone.trim())) next.phone = 'Enter a valid 10-digit mobile number.';
    setErrors(next);
    setProblem('');
    if (Object.keys(next).length === 0) save.mutate();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit customer details"
      description="The email cannot be changed here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="edit-customer-form" loading={save.isPending}>
            Save details
          </Button>
        </>
      }
    >
      <form id="edit-customer-form" onSubmit={submit} noValidate className="flex flex-col gap-md">
        <Input
          label="Full name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <Input
          label="Mobile number"
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          error={errors.phone}
        />
        <Textarea
          label="Allergies"
          maxLength={500}
          value={allergies}
          onChange={(event) => setAllergies(event.target.value)}
        />
        <Textarea
          label="Preferences"
          maxLength={500}
          value={preferences}
          onChange={(event) => setPreferences(event.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
