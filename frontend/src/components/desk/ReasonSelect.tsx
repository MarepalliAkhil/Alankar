import { changeReasons, type ChangeReason } from '../../api/desk';
import { Select } from '../ui';

/**
 * The reason category staff pick before they change, move, reassign or cancel a customer's slot.
 * The customer sees it as a friendly phrase inside a sorry note, so only these preset choices
 * exist (a stylist's private reasons are never among them).
 */
export function ReasonSelect({
  value,
  onChange,
  error,
}: {
  value: ChangeReason | '';
  onChange: (value: ChangeReason | '') => void;
  error?: string;
}) {
  return (
    <Select
      label="Why is this changing?"
      hint="The customer gets a sorry note with this reason."
      required
      placeholder="Choose a reason"
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value as ChangeReason | '')}
      options={changeReasons.map((r) => ({ value: r.value, label: r.label }))}
    />
  );
}
