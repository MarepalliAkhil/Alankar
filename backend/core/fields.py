from django.db import models

from core import crypto


class EncryptedTextField(models.TextField):
    """Stores AES-GCM ciphertext; reads and writes plain strings in Python.

    The ciphertext is bound to `context` (e.g. "people.customerprofile.phone"), so a
    value copied into another column will not decrypt. Not searchable: pair it with a
    blind-index column for lookups.
    """

    def __init__(self, *args, context: str = "", **kwargs):
        self.context = context
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs["context"] = self.context
        return name, path, args, kwargs

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        return crypto.decrypt(value, self.context)

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value
        return crypto.encrypt(str(value), self.context)
