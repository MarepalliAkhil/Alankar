import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { listProducts, listSuppliers } from '../../../api/adminOps';
import { errorDetail } from '../../../api/client';
import {
  closePurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  getSupplierHistory,
  listPurchaseOrders,
  receivePurchaseOrder,
  sendPurchaseOrder,
  updatePurchaseOrder,
  type PoInput,
  type PoStatus,
  type PurchaseOrder,
} from '../../../api/purchasing';
import { formatDateTime, formatINRExact } from '../../../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
  useToast,
  type BadgeTone,
} from '../../ui';

const STATUS: Record<PoStatus, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  partly_received: 'warning',
  received: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
};

/** Orders to suppliers. Stock is added only when goods are received, one delivery at a time. */
export function PurchaseOrdersPanel() {
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState('');
  const [editing, setEditing] = useState<PurchaseOrder | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: listSuppliers });
  const orders = useQuery({
    queryKey: ['purchase-orders', supplier],
    queryFn: () => listPurchaseOrders(supplier || undefined),
  });
  const history = useQuery({
    queryKey: ['supplier-history', supplier],
    queryFn: () => getSupplierHistory(supplier),
    enabled: supplier !== '',
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['supplier-history'] });
    void queryClient.invalidateQueries({ queryKey: ['po-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
  };
  return (
    <Card variant="dense" as="section" aria-label="Purchase orders">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-lg font-semibold text-text">Purchase orders</h2>
          <p className="mt-1 text-sm text-text-muted">
            Order stock from a supplier, send it to them, and book what arrives. Costs are before
            GST. Stock goes up only when you press Receive.
          </p>
        </div>
        <Button type="button" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> New order
        </Button>
      </div>
      <div className="mt-md max-w-sm">
        <Select
          label="Supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="All suppliers"
          options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      {supplier && history.data && (
        <p className="mt-sm text-sm text-text" aria-label="Supplier history">
          {history.data.supplier.name}: {history.data.summary.orders} order
          {history.data.summary.orders === 1 ? '' : 's'}, ordered{' '}
          {formatINRExact(history.data.summary.ordered_value)}, received{' '}
          {formatINRExact(history.data.summary.received_value)}, {history.data.summary.open} still
          open.
        </p>
      )}
      <div className="mt-md">
        {orders.isPending ? (
          <LoadingState label="Loading orders…" />
        ) : orders.isError ? (
          <ErrorState
            description="We couldn't load the purchase orders."
            onRetry={() => void orders.refetch()}
          />
        ) : orders.data.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            description="Create an order to restock a product."
          />
        ) : (
          <ul className="flex flex-col gap-sm">
            {orders.data.map((o) => (
              <li key={o.id} className="rounded-nested border border-border p-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="font-mono font-medium text-text">{o.number}</p>
                  <Badge tone={STATUS[o.status]}>{o.status_label}</Badge>
                </div>
                <p className="mt-xs text-sm text-text">
                  {o.supplier_name} · {o.units_received} of {o.units_ordered} units received ·{' '}
                  {formatINRExact(o.ordered_value)}
                </p>
                <p className="text-xs text-text-muted">
                  Created {formatDateTime(o.created_at)}
                  {o.expected_on ? ` · expected ${o.expected_on}` : ''}
                </p>
                <div className="mt-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setOpenId(o.id)}
                  >
                    Open {o.number}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <OrderForm
          order={editing === 'new' ? null : editing}
          defaultSupplier={supplier}
          onClose={() => setEditing(null)}
          onSaved={(o) => {
            setEditing(null);
            refresh();
            setOpenId(o.id);
          }}
        />
      )}
      {openId && (
        <OrderDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onEdit={(o) => {
            setOpenId(null);
            setEditing(o);
          }}
        />
      )}
    </Card>
  );
}

interface Row {
  product: string;
  quantity: string;
  unit_cost: string;
}

function OrderForm({
  order,
  defaultSupplier,
  onClose,
  onSaved,
}: {
  order: PurchaseOrder | null;
  defaultSupplier: string;
  onClose: () => void;
  onSaved: (o: PurchaseOrder) => void;
}) {
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: listSuppliers });
  const products = useQuery({ queryKey: ['admin-products'], queryFn: listProducts });
  const [supplier, setSupplier] = useState(order?.supplier ?? defaultSupplier);
  const [expected, setExpected] = useState(order?.expected_on ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [rows, setRows] = useState<Row[]>(
    order?.lines?.map((l) => ({
      product: l.product,
      quantity: String(l.quantity),
      unit_cost: l.unit_cost,
    })) ?? [{ product: '', quantity: '1', unit_cost: '' }],
  );
  const [problem, setProblem] = useState('');
  const save = useMutation({
    mutationFn: (body: PoInput) =>
      order ? updatePurchaseOrder(order.id, body) : createPurchaseOrder(body),
    onSuccess: onSaved,
    onError: (error) => setProblem(errorDetail(error) ?? 'Could not save the order.'),
  });
  const change = (i: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem('');
    if (!supplier) return setProblem('Choose a supplier.');
    const lines = rows.map((r) => ({
      product: r.product,
      quantity: Number(r.quantity),
      unit_cost: r.unit_cost,
    }));
    if (lines.some((l) => !l.product || !(l.quantity > 0) || l.unit_cost === '')) {
      return setProblem('Every line needs a product, a quantity and a cost.');
    }
    save.mutate({ supplier, lines, expected_on: expected || null, notes: notes.trim() });
  };
  return (
    <Modal
      busy={save.isPending}
      open
      onClose={onClose}
      title={order ? `Change ${order.number}` : 'New purchase order'}
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-md">
        <div className="grid gap-md sm:grid-cols-2">
          <Select
            label="Supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Choose…"
            options={(suppliers.data ?? [])
              .filter((s) => s.is_active)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
          <Input
            label="Expected on"
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </div>
        <fieldset className="flex flex-col gap-sm">
          <legend className="text-sm font-medium text-text">Products</legend>
          {rows.map((r, i) => (
            <div key={i} className="grid gap-sm sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <Select
                label={`Product ${i + 1}`}
                value={r.product}
                onChange={(e) => change(i, { product: e.target.value })}
                placeholder="Choose…"
                options={(products.data?.results ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.sku})`,
                }))}
              />
              <Input
                label={`Quantity ${i + 1}`}
                inputMode="numeric"
                value={r.quantity}
                onChange={(e) => change(i, { quantity: e.target.value.replace(/\D/g, '') })}
              />
              <Input
                label={`Cost each ${i + 1} (₹)`}
                inputMode="decimal"
                value={r.unit_cost}
                onChange={(e) => change(i, { unit_cost: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((_, n) => n !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setRows((list) => [...list, { product: '', quantity: '1', unit_cost: '' }])
              }
            >
              Add a product
            </Button>
          </div>
        </fieldset>
        <Input
          label="Note to the supplier"
          value={notes}
          maxLength={300}
          onChange={(e) => setNotes(e.target.value)}
        />
        {problem && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {problem}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" loading={save.isPending}>
            Save draft
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OrderDialog({
  id,
  onClose,
  onChanged,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (o: PurchaseOrder) => void;
}) {
  const toast = useToast();
  const order = useQuery({ queryKey: ['po-detail', id], queryFn: () => getPurchaseOrder(id) });
  const [mode, setMode] = useState<'view' | 'receive' | 'close'>('view');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const done = (message: string) => {
    setMode('view');
    setProblem('');
    onChanged();
    toast.show({ tone: 'success', title: message });
  };
  const fail = (error: unknown) => setProblem(errorDetail(error) ?? 'That did not work.');
  const send = useMutation({
    mutationFn: () => sendPurchaseOrder(id),
    onSuccess: (o) =>
      done(o.emailed ? 'Order sent to the supplier' : 'Order marked sent (no supplier email)'),
    onError: fail,
  });
  const receive = useMutation({
    mutationFn: () =>
      receivePurchaseOrder(
        id,
        Object.entries(qty)
          .map(([line, q]) => ({ line, quantity: Number(q || 0) }))
          .filter((i) => i.quantity > 0),
        note.trim(),
      ),
    onSuccess: () => {
      setQty({});
      setNote('');
      done('Stock updated');
    },
    onError: fail,
  });
  const close = useMutation({
    mutationFn: () => closePurchaseOrder(id, reason.trim()),
    onSuccess: () => done('Order closed'),
    onError: fail,
  });
  const o = order.data;
  const open = o?.status === 'sent' || o?.status === 'partly_received';
  return (
    <Modal
      busy={close.isPending || receive.isPending || send.isPending}
      open
      onClose={onClose}
      title={o ? `Purchase order ${o.number}` : 'Purchase order'}
    >
      {order.isPending ? (
        <LoadingState label="Loading the order…" />
      ) : order.isError || !o ? (
        <ErrorState
          description="We couldn't load this order."
          onRetry={() => void order.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-md">
          <p className="text-sm text-text">
            {o.supplier_name} · <Badge tone={STATUS[o.status]}>{o.status_label}</Badge>
          </p>
          {o.close_reason && <p className="text-sm text-text-muted">Reason: {o.close_reason}</p>}
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Products on {o.number}</caption>
            <thead>
              <tr className="text-text-muted">
                <th scope="col">Product</th>
                <th scope="col">Ordered</th>
                <th scope="col">Received</th>
                <th scope="col">Cost each</th>
              </tr>
            </thead>
            <tbody>
              {(o.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <th scope="row" className="font-medium text-text">
                    {l.product_name}
                  </th>
                  <td>{l.quantity}</td>
                  <td>{l.received}</td>
                  <td>{formatINRExact(l.unit_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-text">
            Ordered {formatINRExact(o.ordered_value)} · received {formatINRExact(o.received_value)}{' '}
            (before GST)
          </p>
          {(o.receipts ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text">Deliveries</h3>
              <ul className="mt-xs text-sm text-text-muted">
                {(o.receipts ?? []).map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.created_at)}:{' '}
                    {r.lines.map((l) => `${l.quantity} ${l.product_name}`).join(', ')}
                    {r.note ? ` (${r.note})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
          {mode === 'receive' && (
            <form
              noValidate
              className="flex flex-col gap-sm"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setProblem('');
                receive.mutate();
              }}
            >
              {(o.lines ?? [])
                .filter((l) => l.outstanding > 0)
                .map((l) => (
                  <Input
                    key={l.id}
                    label={`Arrived: ${l.product_name} (${l.outstanding} still due)`}
                    inputMode="numeric"
                    value={qty[l.id] ?? ''}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/\D/g, '') }))
                    }
                  />
                ))}
              <Input
                label="Delivery note"
                value={note}
                maxLength={150}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-sm">
                <Button type="submit" loading={receive.isPending}>
                  Add to stock
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode('view')}>
                  Back
                </Button>
              </div>
            </form>
          )}
          {mode === 'close' && (
            <form
              noValidate
              className="flex flex-col gap-sm"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setProblem('');
                close.mutate();
              }}
            >
              <Input
                label="Why is it being closed?"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-sm">
                <Button type="submit" variant="danger" loading={close.isPending}>
                  {o.status === 'partly_received' ? 'Close the order' : 'Cancel the order'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setMode('view')}>
                  Back
                </Button>
              </div>
            </form>
          )}
          {mode === 'view' && (
            <div className="flex flex-wrap gap-sm">
              {o.status === 'draft' && (
                <>
                  <Button type="button" loading={send.isPending} onClick={() => send.mutate()}>
                    Send to supplier
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => onEdit(o)}>
                    Change
                  </Button>
                  <Button
                    loading={close.isPending}
                    type="button"
                    variant="danger"
                    onClick={() => close.mutate()}
                  >
                    Cancel order
                  </Button>
                </>
              )}
              {open && (
                <>
                  <Button type="button" onClick={() => setMode('receive')}>
                    Receive goods
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setMode('close')}>
                    {o.status === 'partly_received' ? 'Close short' : 'Cancel order'}
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
