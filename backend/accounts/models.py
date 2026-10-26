import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user, created in Task 0 so later migrations never need a user-model swap.

    Public IDs are UUIDs. Registration always forces role = customer (Task 1);
    staff roles are assigned only through an admin invite.
    """

    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        RECEPTIONIST = "receptionist", "Receptionist"
        STYLIST = "stylist", "Stylist"
        ADMIN = "admin", "Admin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField("email address", unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)

    def __str__(self) -> str:
        return self.email or self.username
