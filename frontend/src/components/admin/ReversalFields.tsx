import type { Returnable } from '../../api/pos';
import { Checkbox, Input } from '../ui';
import type { ReversalChoice } from './reversal';

/** Admin: what else a refund undoes. Nothing is reversed unless it is ticked here. */
export function ReversalFields({
  returnable,
  earned,
  redeemed,
  value,
  onChange,
}: {
  returnable: Returnable[];
  earned: number;
  redeemed: number;
  value: ReversalChoice;
  onChange: (next: ReversalChoice) => void;
}) {
  if (returnable.length === 0 && earned === 0 && redeemed === 0) return null;
  return (
    <fieldset className="flex flex-col gap-sm rounded-card border border-border p-md">
      <legend className="px-1 text-sm font-medium text-text">Also undo (optional)</legend>
      {returnable.map((row) => (
        <Input
          key={row.product}
          label={`${row.name}: put back on the shelf (up to ${row.quantity})`}
          inputMode="numeric"
          value={value.restock[row.product] ?? ''}
          onChange={(event) =>
            onChange({
              ...value,
              restock: { ...value.restock, [row.product]: event.target.value },
            })
          }
        />
      ))}
      {(earned > 0 || redeemed > 0) && (
        <Checkbox
          label="Take back loyalty points earned on this bill (and return points used to pay, if the invoice is refunded in full)"
          checked={value.reverseLoyalty}
          onChange={(event) => onChange({ ...value, reverseLoyalty: event.target.checked })}
        />
      )}
      {value.reverseLoyalty && (
        <p className="text-xs text-text-muted">
          Points are taken back in proportion to the amount refunded, never below the customer's
          balance.
        </p>
      )}
    </fieldset>
  );
}
