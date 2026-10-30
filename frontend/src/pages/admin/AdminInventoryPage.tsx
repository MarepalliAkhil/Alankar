import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageSearch, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createProduct,
  createSupplier,
  deleteProduct,
  deleteSupplier,
  getLedger,
  listProducts,
  listSuppliers,
  moveStock,
  updateProduct,
  updateSupplier,
  type AdminProduct,
  type MovementKind,
  type ProductInput,
  type Supplier,
} from '../../api/adminOps';
import { errorDetail } from '../../api/client';
import { PurchaseOrdersPanel } from '../../components/admin/inventory/PurchaseOrdersPanel';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
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
import { formatDateTime, formatINRExact } from '../../lib/format';

type Tab = 'products' | 'ledger' | 'suppliers' | 'orders';
const tabs: TabItem<Tab>[] = [
  { id: 'products', label: 'Products' },
  { id: 'ledger', label: 'Stock ledger' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'orders', label: 'Purchase orders' },
];

const failure = (error: unknown, fallback: string) => errorDetail(error) ?? fallback;

/** Admin: products, suppliers and the stock ledger. A stock level is never typed in. */
export default function AdminInventoryPage() {
  useDocumentTitle('Inventory');
  const [tab, setTab] = useState<Tab>('products');
  const [ledgerFor, setLedgerFor] = useState('');
  return (
    <div className="flex flex-col gap-lg pb-xl">
      <PageHeader
        eyebrow="Admin"
        title="Inventory"
        description="Products, suppliers and the stock ledger. Stock changes only by receiving, adjusting or writing off, and every movement is recorded."
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Inventory" idPrefix="inventory" />
      <TabPanel idPrefix="inventory" id={tab}>
        {tab === 'products' && (
          <ProductsTab
            onHistory={(id) => {
              setLedgerFor(id);
              setTab('ledger');
            }}
          />
        )}
        {tab === 'ledger' && <LedgerTab product={ledgerFor} onProduct={setLedgerFor} />}
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'orders' && <PurchaseOrdersPanel />}
      </TabPanel>
    </div>
  );
}

// ------------------------------------------------------------------------------- products

interface ProductForm {
  sku: string;
  name: string;
  category: string;
  unit_price: string;
  gst_percent: string;
  low_stock_level: string;
  opening_stock: string;
  is_active: boolean;
  description: string;
  sold_online: boolean;
}

const blankProduct: ProductForm = {
  sku: '',
  name: '',
  category: '',
  unit_price: '',
  gst_percent: '18',
  low_stock_level: '5',
  opening_stock: '0',
  is_active: true,
  description: '',
  sold_online: true,
};

function ProductsTab({ onHistory }: { onHistory: (id: string) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['admin-products'], queryFn: listProducts });
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [form, setForm] = useState<ProductForm>(blankProduct);
  const [moving, setMoving] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [problem, setProblem] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
  };

  const open = (target: AdminProduct | 'new') => {
    setEditing(target);
    setProblem('');
    setForm(
      target === 'new'
        ? blankProduct
        : {
            sku: target.sku,
            name: target.name,
            category: target.category,
            unit_price: target.unit_price,
            gst_percent: target.gst_percent,
            low_stock_level: String(target.low_stock_level),
            opening_stock: '0',
            is_active: target.is_active,
            description: target.description ?? '',
            sold_online: target.sold_online ?? true,
          },
    );
  };

  const save = useMutation({
    mutationFn: (body: ProductInput) =>
      editing === 'new' || editing === null ? createProduct(body) : updateProduct(editing.id, body),
    onSuccess: (row) => {
      toast.show({ tone: 'success', title: `${row.name} saved` });
      setEditing(null);
      refresh();
    },
    onError: (error) => setProblem(failure(error, 'Could not save the product.')),
  });

  const remove = useMutation({
    mutationFn: (row: AdminProduct) => deleteProduct(row.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Product deleted' });
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
    if (!form.sku.trim() || form.name.trim().length < 2 || !form.category.trim()) {
      return setProblem('Enter the SKU, name and category.');
    }
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(form.unit_price.trim()) || Number(form.unit_price) <= 0) {
      return setProblem('Enter the price (including GST), like 590 or 590.50.');
    }
    const gst = Number(form.gst_percent);
    if (form.gst_percent.trim() === '' || Number.isNaN(gst) || gst < 0 || gst > 40) {
      return setProblem('GST must be from 0 to 40.');
    }
    const low = Number(form.low_stock_level);
    const opening = Number(form.opening_stock);
    if (!Number.isInteger(low) || low < 0)
      return setProblem('Low-stock level must be a whole number.');
    if (editing === 'new' && (!Number.isInteger(opening) || opening < 0)) {
      return setProblem('Opening stock must be a whole number.');
    }
    setProblem('');
    save.mutate({
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      unit_price: form.unit_price.trim(),
      gst_percent: form.gst_percent.trim(),
      low_stock_level: low,
      is_active: form.is_active,
      description: form.description.trim(),
      sold_online: form.sold_online,
      ...(editing === 'new' ? { opening_stock: opening } : {}),
    });
  };
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (products.isPending) return <LoadingState label="Loading products…" />;
  if (products.isError) {
    return (
      <ErrorState
        description="We couldn't load the products."
        onRetry={() => void products.refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-md">
      {products.data.low_count > 0 && (
        <p role="status" className="text-sm font-medium text-warning-text">
          {products.data.low_count} product{products.data.low_count === 1 ? ' is' : 's are'} at or
          below the low-stock level. Receive stock to clear the alert.
        </p>
      )}
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
          Add a product
        </Button>
      </div>
      {products.data.results.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-6 w-6" />}
          title="No products yet"
          description="Add the retail products you sell at the counter."
        />
      ) : (
        <Table
          caption="Products"
          rows={products.data.results}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Product',
              render: (row) => (
                <div>
                  <p className="font-medium text-text">{row.name}</p>
                  <p className="text-xs text-text-muted">
                    {row.sku} · {row.category}
                  </p>
                </div>
              ),
            },
            {
              key: 'price',
              header: 'Price (incl. GST)',
              render: (row) => formatINRExact(row.unit_price),
            },
            { key: 'stock', header: 'In stock', render: (row) => row.stock },
            {
              key: 'state',
              header: 'Status',
              render: (row) => (
                <div className="flex flex-wrap gap-1">
                  {!row.is_active && <Badge tone="neutral">Hidden</Badge>}
                  {row.is_active && row.low ? (
                    <Badge tone="warning">Low stock</Badge>
                  ) : (
                    row.is_active && <Badge tone="success">OK</Badge>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right',
              render: (row) => (
                <div className="flex flex-wrap justify-end gap-sm">
                  <Button size="sm" onClick={() => setMoving(row)}>
                    Change stock<span className="sr-only"> of {row.name}</span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => open(row)}>
                    Edit<span className="sr-only"> {row.name}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onHistory(row.id)}>
                    History<span className="sr-only"> of {row.name}</span>
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(row)}>
                    Delete<span className="sr-only"> {row.name}</span>
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal
        busy={save.isPending}
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a product' : 'Edit product'}
        description="Stock is not edited here. Use Change stock to receive, adjust or write off."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="product-form" loading={save.isPending}>
              Save product
            </Button>
          </>
        }
      >
        <form id="product-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
          <Input
            label="SKU"
            required
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
          />
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <Input
            label="Category"
            required
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-md">
            <Input
              label="Price incl. GST (₹)"
              required
              inputMode="decimal"
              value={form.unit_price}
              onChange={(e) => set('unit_price', e.target.value)}
            />
            <Input
              label="GST (%)"
              required
              inputMode="decimal"
              value={form.gst_percent}
              onChange={(e) => set('gst_percent', e.target.value)}
            />
            <Input
              label="Low-stock level"
              hint="Alert at or below this"
              inputMode="numeric"
              value={form.low_stock_level}
              onChange={(e) => set('low_stock_level', e.target.value)}
            />
            {editing === 'new' && (
              <Input
                label="Opening stock"
                inputMode="numeric"
                value={form.opening_stock}
                onChange={(e) => set('opening_stock', e.target.value)}
              />
            )}
          </div>
          <Textarea
            label="Shop description (optional)"
            hint="Shown on the online shop. Up to 600 characters."
            maxLength={600}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Checkbox
            label="Sold at the counter"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
          />
          <Checkbox
            label="Sold in the online shop"
            checked={form.sold_online}
            onChange={(e) => set('sold_online', e.target.checked)}
          />
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
        </form>
      </Modal>

      {moving && (
        <StockModal
          product={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            refresh();
          }}
        />
      )}

      <Modal
        busy={remove.isPending}
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this product?"
        description={
          deleting
            ? `${deleting.name} can be deleted only if it never had stock. Otherwise hide it (Edit, untick "Sold at the counter").`
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

const kinds: { value: MovementKind; label: string }[] = [
  { value: 'receive', label: 'Stock received' },
  { value: 'adjust', label: 'Stock count adjustment' },
  { value: 'wastage', label: 'Wastage (damaged, expired, used up)' },
];

function StockModal({
  product,
  onClose,
  onDone,
}: {
  product: AdminProduct;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: listSuppliers });
  const [kind, setKind] = useState<MovementKind>('receive');
  const [quantity, setQuantity] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  const save = useMutation({
    mutationFn: () =>
      moveStock(product.id, {
        kind,
        quantity: Number(quantity),
        note: note.trim(),
        ...(kind === 'receive' && supplier ? { supplier } : {}),
      }),
    onSuccess: (result) => {
      toast.show({
        tone: 'success',
        title: `${product.name}: ${result.product.stock} in stock`,
      });
      onDone();
    },
    onError: (error) => setProblem(failure(error, 'Could not record the movement.')),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const number = Number(quantity);
    if (quantity.trim() === '' || !Number.isInteger(number) || number === 0) {
      return setProblem('Enter a whole number of units.');
    }
    if (kind !== 'adjust' && number < 0) return setProblem('Enter a positive number of units.');
    if (kind !== 'receive' && note.trim().length < 3) {
      return setProblem('Give a short reason.');
    }
    setProblem('');
    save.mutate();
  };

  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title={`Change stock: ${product.name}`}
      description={`Now ${product.stock} in stock.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-form" loading={save.isPending}>
            Record movement
          </Button>
        </>
      }
    >
      <form id="stock-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
        <Select
          label="What happened"
          options={kinds}
          value={kind}
          onChange={(e) => setKind(e.target.value as MovementKind)}
        />
        <Input
          label={kind === 'adjust' ? 'Units to add (+) or remove (−)' : 'Units'}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        {kind === 'receive' && (
          <Select
            label="Supplier (optional)"
            placeholder="No supplier"
            options={(suppliers.data ?? [])
              .filter((s) => s.is_active)
              .map((s) => ({ value: s.id, label: s.name }))}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        )}
        <Input
          label={kind === 'receive' ? 'Note (invoice number, optional)' : 'Reason'}
          required={kind !== 'receive'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
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

// --------------------------------------------------------------------------------- ledger

function LedgerTab({ product, onProduct }: { product: string; onProduct: (id: string) => void }) {
  const products = useQuery({ queryKey: ['admin-products'], queryFn: listProducts });
  const ledger = useQuery({
    queryKey: ['admin-ledger', product],
    queryFn: () => getLedger(product || undefined),
  });
  return (
    <div className="flex flex-col gap-md">
      <Select
        label="Product"
        placeholder="All products"
        options={(products.data?.results ?? []).map((p) => ({ value: p.id, label: p.name }))}
        value={product}
        onChange={(e) => onProduct(e.target.value)}
        className="max-w-sm"
      />
      {ledger.isPending ? (
        <LoadingState label="Loading the ledger…" />
      ) : ledger.isError ? (
        <ErrorState
          description="We couldn't load the ledger."
          onRetry={() => void ledger.refetch()}
        />
      ) : (
        <Table
          caption="Stock ledger"
          rows={ledger.data}
          rowKey={(row) => row.id}
          emptyMessage="No movements yet."
          columns={[
            { key: 'when', header: 'When', render: (row) => formatDateTime(row.created_at) },
            { key: 'product', header: 'Product', render: (row) => row.product_name },
            {
              key: 'delta',
              header: 'Change',
              render: (row) => (
                <span className={row.delta > 0 ? 'text-success-text' : 'text-danger-text'}>
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </span>
              ),
            },
            { key: 'reason', header: 'Why', render: (row) => row.reason_label },
            {
              key: 'detail',
              header: 'Detail',
              render: (row) =>
                [row.note, row.supplier && `from ${row.supplier}`, row.invoice]
                  .filter(Boolean)
                  .join(' · ') || '—',
            },
            { key: 'who', header: 'By', render: (row) => row.actor || '—' },
          ]}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------ suppliers

const blankSupplier = { name: '', contact_person: '', phone: '', email: '', notes: '' };

function SuppliersTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: listSuppliers });
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [form, setForm] = useState(blankSupplier);
  const [problem, setProblem] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] });
  const open = (target: Supplier | 'new') => {
    setEditing(target);
    setProblem('');
    setForm(
      target === 'new'
        ? blankSupplier
        : {
            name: target.name,
            contact_person: target.contact_person,
            phone: target.phone,
            email: target.email,
            notes: target.notes,
          },
    );
  };

  const save = useMutation({
    mutationFn: () =>
      editing === 'new' || editing === null
        ? createSupplier(form)
        : updateSupplier(editing.id, form),
    onSuccess: (row) => {
      toast.show({ tone: 'success', title: `${row.name} saved` });
      setEditing(null);
      refresh();
    },
    onError: (error) => setProblem(failure(error, 'Could not save the supplier.')),
  });

  const toggle = useMutation({
    mutationFn: (row: Supplier) => updateSupplier(row.id, { is_active: !row.is_active }),
    onSuccess: refresh,
    onError: (error) =>
      toast.show({ tone: 'danger', title: 'Not saved', description: failure(error, 'Try again.') }),
  });

  const remove = useMutation({
    mutationFn: (row: Supplier) => deleteSupplier(row.id),
    onSuccess: () => {
      toast.show({ tone: 'success', title: 'Supplier deleted' });
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
    if (form.name.trim().length < 2) return setProblem('Enter the supplier name.');
    setProblem('');
    save.mutate();
  };

  if (suppliers.isPending) return <LoadingState label="Loading suppliers…" />;
  if (suppliers.isError) {
    return (
      <ErrorState
        description="We couldn't load the suppliers."
        onRetry={() => void suppliers.refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => open('new')}>
          Add a supplier
        </Button>
      </div>
      <Table
        caption="Suppliers"
        rows={suppliers.data}
        rowKey={(row) => row.id}
        emptyMessage="No suppliers yet."
        columns={[
          {
            key: 'name',
            header: 'Supplier',
            render: (row) => (
              <div>
                <p className="font-medium text-text">{row.name}</p>
                <p className="text-xs text-text-muted">{row.contact_person}</p>
              </div>
            ),
          },
          {
            key: 'contact',
            header: 'Contact',
            render: (row) => [row.phone, row.email].filter(Boolean).join(' · ') || '—',
          },
          { key: 'uses', header: 'Deliveries', render: (row) => row.movement_count },
          {
            key: 'state',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.is_active ? 'success' : 'neutral'}>
                {row.is_active ? 'Active' : 'Hidden'}
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
                  Edit<span className="sr-only"> {row.name}</span>
                </Button>
                <Button
                  loading={toggle.isPending && toggle.variables?.id === row.id}
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle.mutate(row)}
                >
                  {row.is_active ? 'Hide' : 'Show'}
                  <span className="sr-only"> {row.name}</span>
                </Button>
                <Button
                  loading={remove.isPending && remove.variables?.id === row.id}
                  size="sm"
                  variant="danger"
                  disabled={row.movement_count > 0}
                  title={row.movement_count > 0 ? 'Used in the ledger: hide it instead' : undefined}
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
        busy={save.isPending}
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a supplier' : 'Edit supplier'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="supplier-form" loading={save.isPending}>
              Save supplier
            </Button>
          </>
        }
      >
        <form id="supplier-form" noValidate onSubmit={submit} className="flex flex-col gap-md">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Contact person"
            value={form.contact_person}
            onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
