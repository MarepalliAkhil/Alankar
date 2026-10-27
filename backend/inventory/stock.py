"""Stock levels and the only way to change them: a ledger entry."""

from django.db.models import QuerySet, Sum
from django.db.models.functions import Coalesce

from inventory.models import Product, StockMovement


class StockError(Exception):
    pass


def with_levels(qs: QuerySet[Product] | None = None) -> QuerySet[Product]:
    qs = Product.objects.all() if qs is None else qs
    return qs.annotate(stock=Coalesce(Sum("movements__delta"), 0))


def level(product: Product) -> int:
    return StockMovement.objects.filter(product=product).aggregate(total=Coalesce(Sum("delta"), 0))[
        "total"
    ]


def move(product: Product, delta: int, reason: str, *, actor=None, invoice=None, note: str = ""):
    """Writes one ledger row. The caller holds the product row lock (select_for_update)."""
    if delta < 0 and level(product) + delta < 0:
        raise StockError(f"Only {level(product)} of {product.name} in stock.")
    return StockMovement.objects.create(
        product=product,
        delta=delta,
        reason=reason,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        invoice=invoice,
        note=note[:200],
    )
