"""Builds the parser's catalogue from the database: public facts only (service names and
search words, stylists' first names, products on sale). Nothing about any customer."""

from __future__ import annotations

from air.understand import Catalogue
from chatbot import data


def build(*, with_products: bool = True) -> Catalogue:
    base = data.catalog()
    services = [
        {
            "id": s["id"],
            "name": s["name"],
            "aliases": s.get("aliases", []),
            "gender": s.get("gender", "unisex"),
        }
        for s in base["services"]
    ]
    stylists = [{"id": s["id"], "name": s["name"]} for s in base["stylists"] if s.get("name")]
    products = []
    if with_products:
        from air import orders

        products = [{"id": p["id"], "name": p["name"]} for p in orders.sellable_products()]
    return Catalogue(services=services, stylists=stylists, products=products)
