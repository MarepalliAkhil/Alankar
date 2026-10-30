import { Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, IconButton, Textarea } from '../../ui';

/** One string per line (blank lines are dropped). Keeps what is typed, so Enter works. */
export function LinesField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string[] | undefined;
  onChange: (lines: string[]) => void;
  rows?: number;
}) {
  const [text, setText] = useState((value ?? []).join('\n'));
  return (
    <Textarea
      label={label}
      hint={hint ?? 'One item per line.'}
      rows={rows}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

/** A list of cards with remove buttons and an Add button. */
export function ListEditor<T>({
  items,
  onChange,
  blank,
  noun,
  max,
  render,
}: {
  items: T[] | undefined;
  onChange: (items: T[]) => void;
  blank: () => T;
  noun: string;
  max: number;
  render: (item: T, change: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  const rows = items ?? [];
  return (
    <div className="flex flex-col gap-md">
      {rows.length === 0 && <p className="text-sm text-text-muted">No {noun} yet.</p>}
      {rows.map((item, index) => (
        <div key={index} className="flex flex-col gap-sm rounded-nested border border-border p-md">
          {render(
            item,
            (patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r))),
            index,
          )}
          <div>
            <IconButton
              label={`Remove ${noun} ${index + 1}`}
              icon={<Trash2 className="size-4" />}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          </div>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, blank()])}
        >
          <Plus className="size-4" aria-hidden /> Add {noun}
        </Button>
      </div>
    </div>
  );
}
