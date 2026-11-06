"""'Tell me about <service>': a full explanation built only from the service's own data."""

import pytest
from django.test import Client

from chatbot import registry
from people.models import StylistProfile
from scheduling.models import Service
from scheduling.tests.test_booking import awaiting, catalogue, customer, desk  # noqa: F401

SAME = [
    "what is hair spa",
    "what's hair spa",
    "whats hair spa",
    "tell me about hair spa",
    "explain hair spa",
    "details of hair spa",
    "hair spa details",
    "describe hair spa",
    "what does hair spa include",
    "is hair spa good for dry hair",
    "hair spa kya hai",
    "hair spa ke bare mein batao",
    "hair spa gurinchi cheppandi",
    "hair spa ante enti",
    "tell me abuot hair spa",
    "detials of hair spa",
    "explain hairspa",
]


@pytest.fixture
def reference(engine):
    return engine.answer("tell me about hair spa")


def test_the_answer_has_every_part_in_order(reference):
    lines = reference.text.split("\n")
    assert lines[0].startswith("Hair Spa: A deep-conditioning treatment")  # 1 description
    assert lines[1].startswith("Time: 45 to 75 minutes")  # 3 duration
    assert lines[2].startswith("Price: from Rs 900 incl. GST.")  # 3 price
    assert (
        "Prices include GST and may vary with options such as hair length or add-ons." in lines[2]
    )
    assert lines[3] == "Suits: Everyone (unisex). Division: Salon."  # 4 audience and division
    assert lines[4].startswith("Offered by: ") and "Rahul (" in lines[4]  # 5 published team
    assert [a["label"] for a in reference.actions] == ["Book this service", "See similar services"]
    assert reference.actions[0]["url"] == "/customer/book?service=hair-spa"  # 6 preselected
    assert reference.actions[1]["url"] == "/salon"


@pytest.mark.parametrize("question", SAME)
def test_every_phrasing_lands_on_the_same_answer(engine, reference, question):
    reply = engine.answer(question)
    assert reply.intent == "service_details", (question, reply.intent)
    assert reply.text == reference.text, question


def test_no_understood_line_when_the_name_matched_exactly(engine):
    assert engine.answer("tell me about hair spa").show_rephrase is False
    assert engine.answer("explain deep tissue massage").show_rephrase is False


def test_understood_line_when_a_typo_or_a_synonym_was_used(engine):
    typo = engine.answer("what is swedish massge")
    assert typo.show_rephrase and "Swedish Massage" in typo.rephrased
    synonym = engine.answer("tell me about gents haircut")
    assert synonym.show_rephrase and "Men's Haircut" in synonym.rephrased


def test_nail_services_are_told_apart(engine):
    assert engine.answer("describe pedicure").text.startswith("Pedicure:")
    assert engine.answer("describe manicure").text.startswith("Manicure:")


def test_several_matches_ask_which_one(engine):
    reply = engine.answer("tell me about massage")
    assert "Which one would you like to know about?" in reply.text
    assert "Tell me about Swedish Massage" in reply.suggestions


def test_empty_fields_are_skipped_and_nothing_is_invented(demo):
    spa = Service.objects.get(name="Hair Spa")
    spa.description = ""
    spa.save()
    StylistProfile.objects.update(is_public=False)  # unpublished profiles are never named
    registry.rebuild()
    text = registry.get_engine().answer("tell me about hair spa").text
    assert text.startswith("Hair Spa: Deep-conditioning treatment with a relaxing massage.")
    assert "Offered by" not in text
    assert "Time:" in text and "Price:" in text and "Suits:" in text


def test_every_seeded_service_has_a_description(demo):
    assert not Service.objects.filter(description="").exists()


def test_guest_and_customer_get_the_same_public_answer(demo, customer):
    signed_in_client, _ = customer
    ask = lambda client: client.post(  # noqa: E731
        "/api/chatbot/ask/",
        {"message": "tell me about bridal makeup"},
        content_type="application/json",
    ).json()["reply"]
    guest = ask(Client())
    signed_in = ask(signed_in_client)
    assert guest["text"] == signed_in["text"] and guest["actions"] == signed_in["actions"]
    assert guest["text"].startswith("Bridal Makeup:")
