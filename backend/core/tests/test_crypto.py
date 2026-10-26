import pytest

from core import crypto


def test_encrypt_roundtrip_and_random_nonce():
    a = crypto.encrypt("9876543210", "ctx")
    b = crypto.encrypt("9876543210", "ctx")
    assert a != b and a.startswith("v1:")
    assert crypto.decrypt(a, "ctx") == "9876543210"


def test_ciphertext_is_bound_to_context_and_tamper_evident():
    token = crypto.encrypt("secret", "people.customerprofile.phone")
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(token, "other.column")
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt(tampered, "people.customerprofile.phone")


def test_blind_index_is_stable_for_equivalent_numbers():
    forms = ["9876543210", "+91 98765 43210", "09876543210", "+91-98765-43210"]
    indexes = {crypto.blind_index(crypto.normalize_phone(f), "phone") for f in forms}
    assert len(indexes) == 1
    assert crypto.blind_index("9876543210", "phone") != crypto.blind_index("9876543211", "phone")


@pytest.mark.parametrize(
    "value,valid",
    [("9876543210", True), ("+91 98765 43210", True), ("5876543210", False), ("12345", False)],
)
def test_indian_mobile_validation(value, valid):
    assert crypto.is_valid_indian_mobile(value) is valid


def test_bad_key_is_rejected(settings):
    from django.core.exceptions import ImproperlyConfigured

    settings.SALON_FIELD_KEY = "dG9vLXNob3J0"
    with pytest.raises(ImproperlyConfigured):
        crypto.encrypt("x", "ctx")
