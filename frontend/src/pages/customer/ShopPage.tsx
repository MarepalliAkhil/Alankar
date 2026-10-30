import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { genericErrorMessage } from '../../api/auth-messages';
import {
  addToNextVisit,
  getNextVisit,
  getShopProducts,
  listAddresses,
  placeOrder,
  quoteCart,
  shopFieldError,
  type Address,
  type AddressInput,
  type DeliveryRules,
  type NextVisit,
  type Quote,
  type ShopProduct,
} from '../../api/shop';
import { PageHeader } from '../../components/layout/PageContainer';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  FilterChips,
  IconButton,
  Input,
  LoadingState,
  useToast,
  PendingArea,
} from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cart, useCart } from '../../lib/cart';
import { cn } from '../../lib/cn';
import { formatDateTime, formatINRExact } from '../../lib/format';

type Step = 'cart' | 'checkout';

/** Customer: browse products, fill a cart, pick a delivery address and place the order. */
export default function ShopPage() {
  useDocumentTitle('Shop');
  const products = useQuery({ queryKey: ['shop-products'], queryFn: getShopProducts });
  const nextVisit = useQuery({ queryKey: ['my-next-visit'], queryFn: getNextVisit });
  const items = useCart();
  const [step, setStep] = useState<Step>('cart');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => {
    const names = [...new Set((products.data?.products ?? []).map((p) => p.category))].sort();
    return [{ value: 'all', label: 'All' }, ...names.map((n) => ({ value: n, label: n }))];
  }, [products.data]);

  if (products.isPending) return <LoadingState label="Loading the shop…" />;
  if (products.isError) {
    return (
      <ErrorState
        description="We couldn't load the shop."
        onRetry={() => void products.refetch()}
      />
    );
  }
  const { products: all, delivery } = products.data;
  const shown = category === 'all' ? all : all.filter((p) => p.category === category);

  return (
    <section className="flex flex-col gap-lg pb-xl">
      <PageHeader
        title="Shop"
        description="Salon-grade hair, skin and spa products, delivered to your door."
      />
      {step === 'checkout' ? (
        <Checkout
          delivery={delivery}
          onBack={() => setStep('cart')}
          productsById={Object.fromEntries(all.map((p) => [p.id, p]))}
        />
      ) : (
        <div className="grid gap-lg lg:grid-cols-[1fr_22rem]">
          <div className="flex flex-col gap-md">
            {categories.length > 2 && (
              <FilterChips
                label="Category"
                options={categories}
                value={category}
                onChange={setCategory}
              />
            )}
            {all.length === 0 ? (
              <EmptyState
                title="Nothing in the shop yet"
                description="Products will appear here once the salon lists them."
              />
            ) : (
              <ul className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    inCart={items.find((i) => i.product === p.id)?.quantity ?? 0}
                    max={delivery.max_quantity}
                    visit={nextVisit.data ?? null}
                  />
                ))}
              </ul>
            )}
          </div>
          <CartPanel
            delivery={delivery}
            productsById={Object.fromEntries(all.map((p) => [p.id, p]))}
            onCheckout={() => setStep('checkout')}
          />
        </div>
      )}
    </section>
  );
}

function ProductCard({
  product: p,
  inCart,
  max,
  visit,
}: {
  product: ShopProduct;
  inCart: number;
  max: number;
  visit: NextVisit | null;
}) {
  const limit = Math.min(max, p.available);
  const toast = useToast();
  const queryClient = useQueryClient();
  const addToVisit = useMutation({
    mutationFn: () => addToNextVisit(p.id),
    onSuccess: (v) => {
      toast.show({
        tone: 'success',
        title: `${p.name} added to your visit`,
        description: `We'll keep it for your ${v.service_name} on ${formatDateTime(v.start)}. Pay at the salon.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['shop-products'] });
      void queryClient.invalidateQueries({ queryKey: ['my-next-visit'] });
      void queryClient.invalidateQueries({ queryKey: ['my-appointments'] });
    },
    onError: (error: unknown) =>
      toast.show({
        tone: 'danger',
        title: "Couldn't add it to your visit",
        description: genericErrorMessage(error, 'Please try again.'),
      }),
  });
  return (
    <Card as="li" variant="dense" aria-label={p.name} className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xs">
        <p className="font-semibold text-text">{p.name}</p>
        {!p.in_stock ? (
          <Badge tone="neutral">Out of stock</Badge>
        ) : (
          p.low_stock && <Badge tone="warning">Only {p.available} left</Badge>
        )}
      </div>
      <p className="text-xs uppercase tracking-wide text-text-muted">{p.category}</p>
      {p.description && <p className="text-sm text-text-muted">{p.description}</p>}
      <p className="mt-auto pt-xs text-lg font-semibold text-text">
        {formatINRExact(p.price)}{' '}
        <span className="text-xs font-normal text-text-muted">incl. GST</span>
      </p>
      {inCart > 0 ? (
        <QuantityStepper
          name={p.name}
          value={inCart}
          max={limit}
          onChange={(q) => cart.set(p.id, q)}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={!p.in_stock}
          onClick={() => cart.add(p.id, 1, limit)}
          leftIcon={<ShoppingBag className="size-4" aria-hidden />}
        >
          Add to cart
        </Button>
      )}
      {visit && p.in_stock && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={addToVisit.isPending}
          onClick={() => addToVisit.mutate()}
        >
          Add to my next appointment
        </Button>
      )}
    </Card>
  );
}

function QuantityStepper({
  name,
  value,
  max,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-xs" role="group" aria-label={`Quantity of ${name}`}>
      <IconButton
        label={value === 1 ? `Remove ${name}` : `One less ${name}`}
        onClick={() => onChange(value - 1)}
        icon={value === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
      />
      <span className="min-w-8 text-center font-semibold text-text" aria-live="polite">
        {value}
      </span>
      <IconButton
        label={`One more ${name}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        icon={<Plus className="size-4" />}
      />
    </div>
  );
}

function useQuote(coupon = '') {
  const items = useCart();
  return useQuery({
    queryKey: ['shop-quote', items, coupon],
    queryFn: () => (coupon ? quoteCart(items, coupon) : quoteCart(items)),
    enabled: items.length > 0,
    retry: false,
  });
}

function CartPanel({
  delivery,
  productsById,
  onCheckout,
}: {
  delivery: DeliveryRules;
  productsById: Record<string, ShopProduct>;
  onCheckout: () => void;
}) {
  const items = useCart();
  const quote = useQuote();
  const known = items.filter((i) => productsById[i.product]);
  return (
    <Card
      as="section"
      aria-label="Your cart"
      className="flex h-fit flex-col gap-sm lg:sticky lg:top-24"
    >
      <h2 className="text-lg font-semibold text-text">Your cart</h2>
      {known.length === 0 ? (
        <p className="text-sm text-text-muted">Your cart is empty. Add something you like.</p>
      ) : quote.isPending ? (
        <LoadingState label="Working out the price…" />
      ) : quote.isError ? (
        <div className="flex flex-col gap-xs">
          <p role="alert" className="text-sm font-medium text-danger-text">
            {genericErrorMessage(quote.error, "We couldn't price your cart.")}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => cart.clear()}>
            Empty the cart
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-xs">
            {quote.data.lines.map((ln) => (
              <li key={ln.product} className="flex items-center justify-between gap-sm text-sm">
                <span className="text-text">
                  {ln.name} × {ln.quantity}
                </span>
                <span className="text-text">{formatINRExact(ln.amount)}</span>
              </li>
            ))}
          </ul>
          <Totals quote={quote.data} delivery={delivery} />
          <Button type="button" fullWidth onClick={onCheckout}>
            Checkout
          </Button>
        </>
      )}
    </Card>
  );
}

function Totals({
  quote,
  delivery,
}: {
  quote: Pick<
    Quote,
    | 'items_total'
    | 'delivery_fee'
    | 'total'
    | 'coupon_code'
    | 'coupon_amount'
    | 'member_plan'
    | 'member_amount'
  >;
  delivery: DeliveryRules;
}) {
  const gap =
    delivery.free_delivery_over && Number(quote.delivery_fee) > 0
      ? Number(delivery.free_delivery_over) - Number(quote.items_total)
      : 0;
  return (
    <dl className="flex flex-col gap-1 border-t border-border pt-xs text-sm">
      <div className="flex justify-between text-text-muted">
        <dt>Items (incl. GST)</dt>
        <dd>{formatINRExact(quote.items_total)}</dd>
      </div>
      {Number(quote.coupon_amount) > 0 && (
        <div className="flex justify-between text-text-muted">
          <dt>Coupon {quote.coupon_code}</dt>
          <dd>- {formatINRExact(quote.coupon_amount)}</dd>
        </div>
      )}
      {Number(quote.member_amount) > 0 && (
        <div className="flex justify-between text-text-muted">
          <dt>{quote.member_plan} membership</dt>
          <dd>- {formatINRExact(quote.member_amount)}</dd>
        </div>
      )}
      <div className="flex justify-between text-text-muted">
        <dt>Delivery</dt>
        <dd>{Number(quote.delivery_fee) === 0 ? 'Free' : formatINRExact(quote.delivery_fee)}</dd>
      </div>
      <div className="flex justify-between text-base font-semibold text-text">
        <dt>Total</dt>
        <dd>{formatINRExact(quote.total)}</dd>
      </div>
      {gap > 0 && (
        <p className="text-xs text-text-muted">Add {formatINRExact(gap)} more for free delivery.</p>
      )}
    </dl>
  );
}

const EMPTY_ADDRESS: AddressInput = {
  full_name: '',
  mobile: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
};

const ADDRESS_FIELDS: { key: keyof AddressInput; label: string; required?: boolean }[] = [
  { key: 'full_name', label: 'Full name', required: true },
  { key: 'mobile', label: 'Mobile number', required: true },
  { key: 'line1', label: 'House, flat and street', required: true },
  { key: 'line2', label: 'Area (optional)' },
  { key: 'landmark', label: 'Landmark (optional)' },
  { key: 'city', label: 'City', required: true },
  { key: 'state', label: 'State', required: true },
  { key: 'pincode', label: 'PIN code', required: true },
];

function Checkout({
  delivery,
  onBack,
  productsById,
}: {
  delivery: DeliveryRules;
  onBack: () => void;
  productsById: Record<string, ShopProduct>;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items = useCart();
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState('');
  const quote = useQuote(coupon);
  const tryCoupon = useMutation({
    mutationFn: (code: string) => quoteCart(items, code),
    onSuccess: (q) => {
      setCoupon(q.coupon_code);
      setCouponError('');
    },
    onError: (error: unknown) =>
      setCouponError(
        shopFieldError(error)?.message ?? genericErrorMessage(error, 'That coupon cannot be used.'),
      ),
  });
  const addresses = useQuery({ queryKey: ['my-addresses'], queryFn: listAddresses });
  const [picked, setPicked] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY_ADDRESS);
  const [saveIt, setSaveIt] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');

  const saved = addresses.data ?? [];
  const choice = picked ?? (saved.find((a) => a.is_default)?.id || saved[0]?.id || 'new');

  const place = useMutation({
    mutationFn: () =>
      placeOrder(
        choice === 'new'
          ? { items, address: form, save_address: saveIt, ...(coupon ? { coupon } : {}) }
          : { items, address_id: choice, ...(coupon ? { coupon } : {}) },
      ),
    onSuccess: (order) => {
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['my-addresses'] });
      toast.show({
        tone: 'success',
        title: `Order ${order.number} placed`,
        description: 'Pay now to confirm it.',
      });
      navigate(`/customer/orders/${order.id}`);
    },
    onError: (error: unknown) => {
      const issue = shopFieldError(error);
      if (issue && issue.field in EMPTY_ADDRESS) {
        setErrors({ [issue.field]: issue.message });
        setProblem('');
      } else if (issue?.field === 'coupon') {
        setCoupon('');
        setCouponError(issue.message);
      } else {
        setProblem(genericErrorMessage(error, 'We could not place your order.'));
      }
    },
  });

  const submit = () => {
    setProblem('');
    if (choice === 'new') {
      const missing: Record<string, string> = {};
      for (const f of ADDRESS_FIELDS) {
        if (f.required && !String(form[f.key] ?? '').trim())
          missing[f.key] = `Enter the ${f.label.toLowerCase()}.`;
      }
      if (!/^[1-9]\d{5}$/.test(form.pincode.trim()) && !missing.pincode) {
        missing.pincode = 'Enter a 6-digit PIN code.';
      }
      setErrors(missing);
      if (Object.keys(missing).length) return;
    }
    place.mutate();
  };

  if (items.filter((i) => productsById[i.product]).length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add a product before checking out."
        action={
          <Button type="button" onClick={onBack}>
            Back to the shop
          </Button>
        }
      />
    );
  }

  return (
    <PendingArea
      pending={place.isPending}
      message="Placing your order. Please wait, this can take a few seconds."
    >
      <div className="grid gap-lg lg:grid-cols-[1fr_22rem]">
        <Card className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold text-text">Delivery address</h2>
          <p className="text-sm text-text-muted">
            Every order is delivered, so a full address and a mobile number are required.
          </p>
          {addresses.isPending ? (
            <LoadingState label="Loading your addresses…" />
          ) : (
            <fieldset className="flex flex-col gap-sm">
              <legend className="sr-only">Choose an address</legend>
              {saved.map((a) => (
                <AddressOption
                  key={a.id}
                  address={a}
                  checked={choice === a.id}
                  onPick={() => setPicked(a.id)}
                />
              ))}
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-sm rounded-card border p-sm text-sm',
                  choice === 'new' ? 'border-primary' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="address"
                  checked={choice === 'new'}
                  onChange={() => setPicked('new')}
                  className="accent-primary"
                />
                <span className="font-medium text-text">Use a new address</span>
              </label>
            </fieldset>
          )}
          {choice === 'new' && (
            <div className="grid gap-sm sm:grid-cols-2">
              {ADDRESS_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  required={f.required}
                  value={String(form[f.key] ?? '')}
                  error={errors[f.key]}
                  inputMode={f.key === 'mobile' || f.key === 'pincode' ? 'numeric' : undefined}
                  autoComplete={AUTOCOMPLETE[f.key]}
                  onChange={(e) => setForm((cur) => ({ ...cur, [f.key]: e.target.value }))}
                />
              ))}
              <div className="sm:col-span-2">
                <Checkbox
                  label="Save this address for next time"
                  checked={saveIt}
                  onChange={(e) => setSaveIt(e.target.checked)}
                />
              </div>
            </div>
          )}
        </Card>
        <Card as="section" aria-label="Order summary" className="flex h-fit flex-col gap-sm">
          <h2 className="text-lg font-semibold text-text">Order summary</h2>
          {quote.isPending ? (
            <LoadingState label="Working out the price…" />
          ) : quote.isError ? (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {genericErrorMessage(quote.error, "We couldn't price your cart.")}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-xs text-sm">
                {quote.data.lines.map((ln) => (
                  <li key={ln.product} className="flex justify-between gap-sm">
                    <span className="text-text">
                      {ln.name} × {ln.quantity}
                    </span>
                    <span className="text-text">{formatINRExact(ln.amount)}</span>
                  </li>
                ))}
              </ul>
              <Totals quote={quote.data} delivery={delivery} />
            </>
          )}
          <div className="flex items-end gap-xs">
            <div className="min-w-0 flex-1">
              <Input
                label="Coupon code"
                autoComplete="off"
                value={couponInput}
                error={couponError || undefined}
                onChange={(e) => setCouponInput(e.target.value)}
              />
            </div>
            {coupon ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCoupon('');
                  setCouponInput('');
                }}
              >
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={tryCoupon.isPending}
                disabled={!couponInput.trim()}
                onClick={() => tryCoupon.mutate(couponInput.trim())}
              >
                Apply
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Your items are held for {delivery.payment_hold_minutes} minutes while you pay. A gift
            card can be used on the payment step.
          </p>
          {problem && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {problem}
            </p>
          )}
          <Button
            type="button"
            fullWidth
            loading={place.isPending}
            loadingText="Placing your order…"
            onClick={submit}
          >
            Place order
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={onBack}>
            Back to the cart
          </Button>
        </Card>
      </div>
    </PendingArea>
  );
}

const AUTOCOMPLETE: Partial<Record<keyof AddressInput, string>> = {
  full_name: 'name',
  mobile: 'tel-national',
  line1: 'address-line1',
  line2: 'address-line2',
  city: 'address-level2',
  state: 'address-level1',
  pincode: 'postal-code',
};

function AddressOption({
  address: a,
  checked,
  onPick,
}: {
  address: Address;
  checked: boolean;
  onPick: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-sm rounded-card border p-sm text-sm',
        checked ? 'border-primary' : 'border-border',
      )}
    >
      <input
        type="radio"
        name="address"
        checked={checked}
        onChange={onPick}
        className="mt-1 accent-primary"
      />
      <span className="flex flex-col">
        <span className="font-medium text-text">
          {a.label || a.full_name}
          {a.is_default && <span className="ml-xs text-xs text-text-muted">(default)</span>}
        </span>
        <span className="text-text-muted">
          {a.line1}, {a.city} {a.pincode} · {a.mobile}
        </span>
      </span>
    </label>
  );
}
