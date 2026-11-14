from django.core.management.base import BaseCommand

from recommendations.build import build


class Command(BaseCommand):
    help = "Rebuilds the recommendation tables from completed visits and evaluates them."

    def add_arguments(self, parser):
        parser.add_argument("--no-eval", action="store_true", help="Skip the offline evaluation.")

    def handle(self, *args, **options):
        snap = build(evaluate_too=not options["no_eval"])
        ev = snap.evaluation or {}
        self.stdout.write(
            f"Recommendations built from {snap.visits_used} visits: {snap.pairs} service pairs, "
            f"{len(snap.quiet_times)} quiet times."
        )
        if ev.get("customers"):
            self.stdout.write(
                f"Evaluation ({ev['customers']} customers, time split at {ev['cutoff']}): "
                f"hit rate@5 {ev['hit_rate']:.0%} vs popularity {ev['baseline_hit_rate']:.0%}; "
                f"precision@5 {ev['precision']:.3f} vs {ev['baseline_precision']:.3f}."
            )
        elif ev:
            self.stdout.write(f"Evaluation: {ev.get('note', '')}")
