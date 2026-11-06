import pytest
from django.core.management import call_command

from chatbot import registry


@pytest.fixture
def demo(db):
    """The demo catalogue, hours, contact and FAQ in the database, and a fresh engine."""
    call_command("seed_demo", verbosity=0)
    registry.rebuild()
    yield
    registry.rebuild()


@pytest.fixture
def engine(demo):
    return registry.get_engine()
