import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { listAdminServices } from '../../../api/admin';
import { errorDetail } from '../../../api/client';
import {
  createPackage,
  listPackages,
  updatePackage,
  type PackageInput,
  type PackageRow,
} from '../../../api/wallet';
import { formatINR } from '../../../lib/format';
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
  Select,
  Textarea,
  useToast,
} from '../../ui';

/** Admin: bundles of sessions sold at a lower price than buying each visit. */
export function PackagesPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const packages = useQuery({ queryKey: ['w-packages'], queryFn: listPackages });
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['w-packages'] });
  const flip = useMutation({
    mutationFn: (p: PackageRow) => updatePackage(p.id, { is_active: !p.is_active }),
    onSuccess: (p) => {
      refresh();
      toast.show({
        tone: 'success',
        title: p.is_active ? `${p.name} is on sale` : `${p.name} is off sale`,
      });
    },
  });
  return (
    <Card variant="dense" as="section" aria-label="Packages">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Packages</h2>
          <p className="mt-1 text-sm text-text-muted">
            A bundle of sessions paid for once and used up visit by visit. Customers buy them online
            or at the counter. Changing a package never changes what someone already bought.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> New package
        </Button>
      </div>
      <div className="mt-md">
        {packages.isPending ? (
          <LoadingState label="Loading packages…" />
        ) : packages.isError ? (
          <ErrorState
            description="We couldn't load the packages."
            onRetry={() => void packages.refetch()}
          />
        ) : packages.data.length === 0 ? (
          <EmptyState title="No packages yet" description="Create one to start selling sessions." />
        ) : (
          <ul className="flex flex-col gap-sm">
            {packages.data.map((p) => (
              <li key={p.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-semibold text-text">{p.name}</p>
                  <Badge tone={p.is_active ? 'success' : 'neutral'}>
                    {p.is_active ? 'On sale' : 'Off sale'}
                  </Badge>
                  <span className="text-sm text-text-muted">
                    {formatINR(p.price)} · valid {p.validity_days} days · sold {p.sold ?? 0}
                  </span>
                </div>
                <p className="mt-xs text-sm text-text-muted">
                  {p.items.map((i) => `${i.quantity} × ${i.service_name}`).join(', ')}
                </p>
                <div className="mt-sm flex flex-wrap gap-sm">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={flip.isPending}
                    onClick={() => flip.mutate(p)}
                  >
                    {p.is_active ? 'Take off sale' : 'Put on sale'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <PackageForm
          pack={editing === 'new' ? null : editing}
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

interface Row {
  service: string;
  quantity: string;
}

function PackageForm({
  pack,
  onClose,
  onSaved,
}: {
  pack: PackageRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const services = useQuery({ queryKey: ['w-services'], queryFn: listAdminServices });
  const [form, setForm] = useState({
    name: pack?.name ?? '',
    description: pack?.description ?? '',
    price: pack ? String(Number(pack.price)) : '',
    validity_days: String(pack?.validity_days ?? 90),
    is_active: pack?.is_active ?? true,
  });
  const [rows, setRows] = useState<Row[]>(
    pack
      ? pack.items.map((i) => ({ service: i.service, quantity: String(i.quantity) }))
      : [{ service: '', quantity: '3' }],
  );
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: (body: PackageInput) => (pack ? updatePackage(pack.id, body) : createPackage(body)),
    onSuccess: () => {
      toast.show({ tone: 'success', title: pack ? 'Package saved' : 'Package created' });
      onSaved();
    },
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save.'),
  });
  const options = (services.data ?? [])
    .filter((s) => s.is_active)
    .map((s) => ({ value: s.id, label: s.name }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setProblem('Give the package a name.');
    if (!(Number(form.price) > 0)) return setProblem('Enter the price.');
    const items = rows.filter((r) => r.service);
    if (items.length === 0) return setProblem('Add at least one service.');
    if (new Set(items.map((r) => r.service)).size !== items.length)
      return setProblem('List each service once.');
    if (items.some((r) => !(Number(r.quantity) >= 1)))
      return setProblem('Sessions must be 1 or more.');
    setProblem('');
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price,
      validity_days: Number(form.validity_days),
      is_active: form.is_active,
      items: items.map((r) => ({ service: r.service, quantity: Number(r.quantity) })),
    });
  };
  return (
    <Modal open onClose={onClose} title={pack ? `Edit ${pack.name}` : 'New package'} size="lg">
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Price (₹, incl. GST)"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
          <Input
            label="Valid for (days)"
            inputMode="numeric"
            value={form.validity_days}
            onChange={(e) => setForm((f) => ({ ...f, validity_days: e.target.value }))}
          />
        </div>
        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <fieldset className="flex flex-col gap-sm">
          <legend className="text-sm font-medium text-text">Sessions included</legend>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-end gap-sm">
              <Select
                label={`Service ${index + 1}`}
                value={row.service}
                placeholder="Choose a service"
                options={options}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === index ? { ...r, service: e.target.value } : r)),
                  )
                }
              />
              <Input
                label="Sessions"
                inputMode="numeric"
                value={row.quantity}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove service ${index + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setRows((rs) => [...rs, { service: '', quantity: '1' }])}
            >
              <Plus className="size-4" aria-hidden /> Add a service
            </Button>
          </div>
        </fieldset>
        <Checkbox
          label="On sale"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save package
          </Button>
        </div>
      </form>
    </Modal>
  );
}
