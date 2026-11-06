import type { Reversal } from '../../api/pos';

export interface ReversalChoice {
  /** product id -> units to put back */
  restock: Record<string, string>;
  reverseLoyalty: boolean;
}

export const noReversal: ReversalChoice = { restock: {}, reverseLoyalty: false };

/** Turns the form state into the API payload (units above zero only). */
export function toReversal(choice: ReversalChoice): Reversal {
  return {
    restock: Object.entries(choice.restock)
      .map(([product, quantity]) => ({ product, quantity: Number(quantity) }))
      .filter((row) => Number.isInteger(row.quantity) && row.quantity > 0),
    reverse_loyalty: choice.reverseLoyalty,
  };
}
