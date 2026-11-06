import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export interface AccordionItem {
  id: string | number;
  title: string;
  content: ReactNode;
}

/** Native <details> accordion: keyboard and screen-reader friendly without extra JS. */
export function Accordion({ items }: { items: readonly AccordionItem[] }) {
  return (
    <div className="flex flex-col gap-sm">
      {items.map((item) => (
        <details key={item.id} className="glass-dense group rounded-nested px-md py-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-md py-1 font-medium text-text focus-visible:shadow-focus focus-visible:outline-none">
            {item.title}
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-base group-open:rotate-180"
            />
          </summary>
          <div className="pb-sm pt-1 text-sm text-text-muted">{item.content}</div>
        </details>
      ))}
    </div>
  );
}
