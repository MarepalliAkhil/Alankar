import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createCategory,
  createRoom,
  createService,
  deleteCategory,
  deleteRoom,
  deleteService,
  getCatalogueOptions,
  listAdminCategories,
  listAdminRooms,
  listAdminServices,
  updateCategory,
  updateRoom,
  updateService,
  type AdminCategory,
  type AdminRoom,
  type AdminService,
  type CatalogueOptions,
  type Option,
  type ServiceInput,
} from '../../api/admin';
import { errorDetail, serverFieldErrors } from '../../api/client';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  Table,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
  type TabItem,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatINRExact } from '../../lib/format';

type Tab = 'services' | 'categories' | 'rooms';
const tabs: TabItem<Tab>[] = [
  { id: 'services', label: 'Services' },
  { id: 'categories', label: 'Categories' },
  { id: 'rooms', label: 'Rooms' },
];

const failure = (error: unknown, fallback: string) => errorDetail(error) ?? fallback;

/** Admin: the catalogue the public site and the booking page read. Changes show there at once. */
export default function ServicesPage() {
  useDocumentTitle('Services');
  const [tab, setTab] = useState<Tab>('services');
  const options = useQuery({ queryKey: ['catalogue-options'], queryFn: getCatalogueOptions });

  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Services"
        description="Services, categories and rooms. Changes show on the public site and the booking page at once, and every change is recorded in the audit log."
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Catalogue" idPrefix="catalogue" />
      {options.isPending ? (
        <Card variant="dense">
          <LoadingState label="Loading…" />
        </Card>
      ) : options.isError ? (
        <Card variant="dense">
          <ErrorState
            description="We couldn't load the catalogue."
            onRetry={() => void options.refetch()}
          />
        </Card>
      ) : (
        <>
          <TabPanel idPrefix="catalogue" id={tab}>
            {tab === 'services' && <ServicesTab options={options.data} />}
            {tab === 'categories' && <CategoriesTab options={options.data} />}
            {tab === 'rooms' && <RoomsTab options={options.data} />}
          </TabPanel>
        </>
      )}
    </div>
  );
}

const divisionLabel = (options: CatalogueOptions, value: string) =>
  options.divisions.find((d) => d.value === value)?.label ?? value;

// --------------------------------------------------------------------------------- services

interface ServiceForm {
  category: string;
  name: string;
  summary: string;
  description: string;
  audience: string;
  duration_minutes: string;
  price: string;
  gst_percent: string;
  task_payout: string;
  is_active: boolean;
  variants: OptionForm[];
  addons: OptionForm[];
}
interface OptionForm {
  id?: string;
  label: string;
  price: string;
  duration_minutes: string;
}

const blankService = (): ServiceForm => ({
  category: '',
  name: '',
  summary: '',
  description: '',
  audience: 'unisex',
  duration_minutes: '30',
  price: '',
  gst_percent: '',
  task_payout: '',
  is_active: true,
  variants: [],
  addons: [],
});

const fromService = (s: AdminService): ServiceForm => ({
  category: s.category,
  name: s.name,
  summary: s.summary,
  description: s.description,
  audience: s.audience,
  duration_minutes: String(s.duration_minutes),
  price: s.price,
  gst_percent: s.gst_percent ?? '',
  task_payout: s.task_payout ?? '',
  is_active: s.is_active,
  variants: s.variants.map((o) => ({
    id: o.id,
    label: o.label,
    price: o.price,
    duration_minutes: String(o.duration_minutes),
  })),
  addons: s.addons.map((o) => ({
    id: o.id,
    label: o.label,
    price: o.price,
    duration_minutes: String(o.duration_minutes),
  })),
});

const money = /^\d{1,7}(\.\d{1,2})?$/;

/** Returns the request body, or the first problem found. */
function buildServiceInput(form: ServiceForm): ServiceInput | { problem: string } {
  if (!form.category) return { problem: 'Choose a category.' };
  if (form.name.trim().length < 2) return { problem: 'Enter the service name.' };
  if (!form.summary.trim()) return { problem: 'Add a one-line summary.' };
  if (!money.test(form.price.trim())) return { problem: 'Enter the price, like 450 or 450.50.' };
  const duration = Number(form.duration_minutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 600) {
    return { problem: 'Duration must be 5 to 600 minutes.' };
  }
  if (form.gst_percent.trim() !== '' && !/^\d{1,2}(\.\d{1,2})?$/.test(form.gst_percent.trim())) {
    return { problem: 'GST must be a percentage like 18, or empty to use the salon rate.' };
  }
  if (form.task_payout.trim() !== '' && !money.test(form.task_payout.trim())) {
    return { problem: 'Payout must be an amount like 120, or empty.' };
  }
  const options = (rows: OptionForm[], what: string): Option[] | string => {
    const out: Option[] = [];
    for (const row of rows) {
      const minutes = Number(row.duration_minutes);
      if (!row.label.trim() || !money.test(row.price.trim())) {
        return `Each ${what} needs a name and a price.`;
      }
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
        return `Each ${what} needs minutes from 0 to 600.`;
      }
      out.push({
        ...(row.id ? { id: row.id } : {}),
        label: row.label.trim(),
        price: row.price.trim(),
        duration_minutes: minutes,
      });
    }
    return out;
  };
  const variants = options(form.variants, 'option');
  if (typeof variants === 'string') return { problem: variants };
  const addons = options(form.addons, 'add-on');
  if (typeof addons === 'string') return { problem: addons };
  return {
    category: form.category,
    name: form.name.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    audience: form.audience,
    duration_minutes: duration,
    price: form.price.trim(),
    gst_percent: form.gst_percent.trim() === '' ? null : form.gst_percent.trim(),
    task_payout: form.task_payout.trim() === '' ? null : form.task_payout.trim(),
    is_active: form.is_active,
    variants,
    addons,
  };
}

function ServicesTab({ options }: { options: CatalogueOptions }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const services = useQuery({ queryKey: ['admin-services'], queryFn: listAdminServices });
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: listAdminCategories });
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);
  const [form, setForm] = useState<ServiceForm>(blankService());
  const [problem, setProblem] = useState('');
  const [deleting, setDeleting] = useState<AdminService | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-services'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  };
  const open = (target: AdminService | 'new') => {
    setEditing(target);
    setForm(target === 'new' ? blankService() : fromService(target));
    setProblem('');
  };

  const save = useMutation({
    mutationFn: (body: ServiceInput) =>
      editing === 'new' || editing === null ? createService(body) : updateService(editing.id, body),
    onSuccess: (saved) => {
      toast.show({
        tone: 'success',
        title: `${saved.name} saved`,
        description: 'It is live on the site.',
      });
      setEditing(null);
      refresh();
    },
    onError: (error) => {
      const fields = serverFieldErrors(error);
      setProblem(
        Object.values(fields)[0] ?? failure(error, 'Could not save the service. Please try again.'),
      );
    },
  });

  const toggle = useMutation({
    mutationFn: (row: AdminService) => updateService(row.id, { is_active: !row.is_active }),
    onSuccess: (row) => {
      toast.show({
        tone: 'success',
        title: row.is_active ? `${row.name} is shown again` : `${row.name} is hidden`,
      });
      refresh();
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Could not update',
        description: failure(error, 'Please try again.'),
      }),
  });

  const remove = useMutation({
    mutationFn: (row: AdminService) => deleteService(row.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Service deleted' });
      setDeleting(null);
      refresh();
    },
    onError: (error) => {
      toast.show({
        tone: 'danger',
        title: 'Not deleted',
        description: failure(error, 'Please try again.'),
      });
      setDeleting(null);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const built = buildServiceInput(form);
    if ('problem' in built) {
      setProblem(built.problem);
      return;
    }
    setProblem('');
    save.mutate(built);
  };

  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (services.isPending || categories.isPending) {
    return (
      <Card variant="dense">
        <LoadingState label="Loading services…" />
      </Card>
    );
  }
  if (services.isError || categories.isError) {
    return (
      <Card variant="dense">
        <ErrorState
          description="We couldn't load the services."
          onRetry={() => {
            void services.refetch();
            void categories.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
          Add a service
        </Button>
      </div>
      <Table
        caption="Services"
        rows={services.data}
        rowKey={(row) => row.id}
        emptyMessage="No services yet."
        columns={[
          {
            key: 'name',
            header: 'Service',
            render: (row) => (
              <div>
                <p className="font-medium text-text">{row.name}</p>
                <p className="text-xs text-text-muted">
                  {divisionLabel(options, row.division)} · {row.category_name}
                </p>
              </div>
            ),
          },
          { key: 'price', header: 'Price', render: (row) => formatINRExact(row.price) },
          { key: 'time', header: 'Time', render: (row) => `${row.duration_minutes} min` },
          {
            key: 'gst',
            header: 'GST',
            render: (row) => (row.gst_percent === null ? 'Salon rate' : `${row.gst_percent}%`),
          },
          {
            key: 'payout',
            header: 'Stylist payout',
            render: (row) => (row.task_payout === null ? '—' : formatINRExact(row.task_payout)),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.is_active ? 'success' : 'neutral'}>
                {row.is_active ? 'Shown' : 'Hidden'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            className: 'text-right',
            render: (row) => (
              <div className="flex flex-wrap justify-end gap-sm">
                <Button size="sm" variant="secondary" onClick={() => open(row)}>
                  Edit
                  <span className="sr-only"> {row.name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={toggle.isPending && toggle.variables?.id === row.id}
                  onClick={() => toggle.mutate(row)}
                >
                  {row.is_active ? 'Hide' : 'Show'}
                  <span className="sr-only"> {row.name}</span>
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(row)}>
                  Delete
                  <span className="sr-only"> {row.name}</span>
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a service' : 'Edit service'}
        description="Prices are before GST. Leave GST empty to use the salon's rate."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="service-form" loading={save.isPending}>
              Save service
            </Button>
          </>
        }
      >
        <form id="service-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
          <Select
            label="Category"
            required
            placeholder="Choose a category"
            options={categories.data.map((c) => ({
              value: c.id,
              label: `${divisionLabel(options, c.division)} · ${c.name}`,
            }))}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <Input
            label="Summary"
            required
            hint="One line shown on the service card."
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Select
            label="For"
            options={options.audiences}
            value={form.audience}
            onChange={(e) => set('audience', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-md">
            <Input
              label="Price (₹)"
              required
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
            <Input
              label="Minutes"
              required
              inputMode="numeric"
              value={form.duration_minutes}
              onChange={(e) => set('duration_minutes', e.target.value)}
            />
            <Input
              label="GST (%)"
              inputMode="decimal"
              hint="Empty = salon rate"
              value={form.gst_percent}
              onChange={(e) => set('gst_percent', e.target.value)}
            />
            <Input
              label="Stylist payout (₹)"
              inputMode="decimal"
              hint="Paid per completed service"
              value={form.task_payout}
              onChange={(e) => set('task_payout', e.target.value)}
            />
          </div>
          <OptionsEditor
            title="Options (for example Short / Long hair)"
            noun="option"
            rows={form.variants}
            onChange={(rows) => set('variants', rows)}
          />
          <OptionsEditor
            title="Add-ons"
            noun="add-on"
            rows={form.addons}
            onChange={(rows) => set('addons', rows)}
          />
          <Checkbox
            label="Shown on the site and the booking page"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
          />
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
        </form>
      </Drawer>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this service?"
        description={
          deleting
            ? deleting.visits > 0
              ? `${deleting.name} has ${deleting.visits} visit(s) on record, so it cannot be deleted. Hide it instead.`
              : `${deleting.name} will be removed from the site and the booking page.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={(deleting?.visits ?? 0) > 0}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">This is recorded in the audit log.</p>
      </Modal>
    </div>
  );
}

function OptionsEditor({
  title,
  noun,
  rows,
  onChange,
}: {
  title: string;
  noun: string;
  rows: OptionForm[];
  onChange: (rows: OptionForm[]) => void;
}) {
  const edit = (index: number, patch: Partial<OptionForm>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
      <legend className="px-1 text-sm font-medium text-text">{title}</legend>
      {rows.map((row, index) => (
        <div key={row.id ?? index} className="grid grid-cols-[1fr_5rem_4rem_auto] items-end gap-sm">
          <Input
            label={`${noun} name ${index + 1}`}
            value={row.label}
            onChange={(e) => edit(index, { label: e.target.value })}
          />
          <Input
            label={`${noun} price ${index + 1}`}
            inputMode="decimal"
            value={row.price}
            onChange={(e) => edit(index, { price: e.target.value })}
          />
          <Input
            label={`${noun} minutes ${index + 1}`}
            inputMode="numeric"
            value={row.duration_minutes}
            onChange={(e) => edit(index, { duration_minutes: e.target.value })}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove ${noun} ${index + 1}`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...rows, { label: '', price: '', duration_minutes: '0' }])}
        >
          Add {noun}
        </Button>
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------------------- categories

function CategoriesTab({ options }: { options: CatalogueOptions }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: listAdminCategories });
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [active, setActive] = useState(true);
  const [problem, setProblem] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-services'] });
  };
  const open = (target: AdminCategory | 'new') => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
    setDivision(target === 'new' ? '' : target.division);
    setActive(target === 'new' ? true : target.is_active);
    setProblem('');
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), division, is_active: active };
      return editing === 'new' || editing === null
        ? createCategory(body)
        : updateCategory(editing.id, body);
    },
    onSuccess: (row) => {
      toast.show({ tone: 'success', title: `${row.name} saved` });
      setEditing(null);
      refresh();
    },
    onError: (error) => setProblem(failure(error, 'Could not save. Please try again.')),
  });

  const remove = useMutation({
    mutationFn: (row: AdminCategory) => deleteCategory(row.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Category deleted' });
      refresh();
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Not deleted',
        description: failure(error, 'Please try again.'),
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setProblem('Enter the category name.');
    if (!division) return setProblem('Choose a division.');
    setProblem('');
    save.mutate();
  };

  if (categories.isPending) {
    return (
      <Card variant="dense">
        <LoadingState label="Loading categories…" />
      </Card>
    );
  }
  if (categories.isError) {
    return (
      <Card variant="dense">
        <ErrorState
          description="We couldn't load the categories."
          onRetry={() => void categories.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-muted">
        The three divisions (Salon, Spa, Beauty parlor) are fixed. Categories group services inside
        them.
      </p>
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
          Add a category
        </Button>
      </div>
      <Table
        caption="Categories"
        rows={categories.data}
        rowKey={(row) => row.id}
        emptyMessage="No categories yet."
        columns={[
          { key: 'name', header: 'Category', render: (row) => row.name },
          {
            key: 'division',
            header: 'Division',
            render: (row) => divisionLabel(options, row.division),
          },
          { key: 'count', header: 'Services', render: (row) => row.service_count },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.is_active ? 'success' : 'neutral'}>
                {row.is_active ? 'Shown' : 'Hidden'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            className: 'text-right',
            render: (row) => (
              <div className="flex justify-end gap-sm">
                <Button size="sm" variant="secondary" onClick={() => open(row)}>
                  Edit<span className="sr-only"> {row.name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={row.service_count > 0}
                  title={row.service_count > 0 ? 'Move or hide its services first' : undefined}
                  onClick={() => remove.mutate(row)}
                >
                  Delete<span className="sr-only"> {row.name}</span>
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a category' : 'Edit category'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" loading={save.isPending}>
              Save category
            </Button>
          </>
        }
      >
        <form id="category-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Division"
            required
            placeholder="Choose a division"
            options={options.divisions}
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          />
          <Checkbox
            label="Shown on the site"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------------------------ rooms

function RoomsTab({ options }: { options: CatalogueOptions }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rooms = useQuery({ queryKey: ['admin-rooms'], queryFn: listAdminRooms });
  const [editing, setEditing] = useState<AdminRoom | 'new' | null>(null);
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [active, setActive] = useState(true);
  const [problem, setProblem] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-rooms'] });
  const open = (target: AdminRoom | 'new') => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
    setDivision(target === 'new' ? '' : target.division);
    setActive(target === 'new' ? true : target.is_active);
    setProblem('');
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), division, is_active: active };
      return editing === 'new' || editing === null
        ? createRoom(body)
        : updateRoom(editing.id, body);
    },
    onSuccess: (row) => {
      toast.show({ tone: 'success', title: `${row.name} saved` });
      setEditing(null);
      refresh();
    },
    onError: (error) => {
      const fields = serverFieldErrors(error);
      setProblem(Object.values(fields)[0] ?? failure(error, 'Could not save. Please try again.'));
    },
  });

  const remove = useMutation({
    mutationFn: (row: AdminRoom) => deleteRoom(row.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Room deleted' });
      refresh();
    },
    onError: (error) =>
      toast.show({
        tone: 'danger',
        title: 'Not deleted',
        description: failure(error, 'Please try again.'),
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return setProblem('Enter the room name.');
    if (!division) return setProblem('Choose a division.');
    setProblem('');
    save.mutate();
  };

  if (rooms.isPending) {
    return (
      <Card variant="dense">
        <LoadingState label="Loading rooms…" />
      </Card>
    );
  }
  if (rooms.isError) {
    return (
      <Card variant="dense">
        <ErrorState
          description="We couldn't load the rooms."
          onRetry={() => void rooms.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
          Add a room
        </Button>
      </div>
      <Table
        caption="Rooms"
        rows={rooms.data}
        rowKey={(row) => row.id}
        emptyMessage="No rooms yet."
        columns={[
          { key: 'name', header: 'Room', render: (row) => row.name },
          {
            key: 'division',
            header: 'Division',
            render: (row) => divisionLabel(options, row.division),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.is_active ? 'success' : 'neutral'}>
                {row.is_active ? 'In use' : 'Hidden'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            className: 'text-right',
            render: (row) => (
              <div className="flex justify-end gap-sm">
                <Button size="sm" variant="secondary" onClick={() => open(row)}>
                  Edit<span className="sr-only"> {row.name}</span>
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove.mutate(row)}>
                  Delete<span className="sr-only"> {row.name}</span>
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a room' : 'Edit room'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="room-form" loading={save.isPending}>
              Save room
            </Button>
          </>
        }
      >
        <form id="room-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Division"
            required
            placeholder="Choose a division"
            options={options.divisions}
            value={division}
            onChange={(e) => setDivision(e.target.value)}
          />
          <Checkbox label="In use" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
