# ruff: noqa: E501
"""Frozen copy of the Task 9 seed text for OVERVIEW, PROJECT, MAPPING and DECISIONS. Migration
website.0004 compares the stored page with these values and replaces a section only when it is still
exactly this text, so nothing the admin edited is ever overwritten."""

OVERVIEW = {
    "headline": "Built for Zenotians: a working salon, spa and beauty-parlor platform, end to end",
    "intro": (
        "Alankar is a unisex salon, spa and beauty-parlor website with a management system behind "
        "it. It follows one visit from the first booking request to the receipt and the rating, "
        "and it gives each of four roles (customer, receptionist, stylist and admin) only the "
        "screens and data that role needs. It is an independent portfolio project: payments, "
        "SMS, email and WhatsApp are simulated, and it is a single shop."
    ),
    "start_here": [
        "Read The project for the four roles, the booking lifecycle and the tech stack.",
        "Read How it maps to Zenoti for what is built, and what is simplified or left out.",
        "Read Engineering decisions for the choices that matter most, with the files they live in.",
        "Open Try the demo (when it is available) to click through it as each role.",
    ],
    "demo_url": "",
    "github_url": "",
    "resume_pdf_url": "",
}

PROJECT = {
    "intro": (
        "A guest browses the public site, signs in to book, and sends a booking request. The "
        "front desk and the chosen stylist must both accept it, and then a payment link follows. "
        "After payment the visit is scheduled; the guest checks in, the stylist runs the "
        "service, and the desk bills it. The customer then rates the stylist, and the admin "
        "reviews payroll, reports and staff performance."
    ),
    "roles": [
        {
            "role": "Customer",
            "does": [
                "Browses services and prices, sends a booking request, pays the emailed link.",
                "Taps I'm here, reschedules or cancels, chats with the assigned stylist.",
                "Sees own invoices, packages and orders; must rate the stylist after a visit.",
            ],
        },
        {
            "role": "Receptionist",
            "does": [
                "Accepts request cards (picks the stylist for an any-stylist request); moves or cancels with a sorry note; checks guests in.",
                "Bills in the point of sale, takes cash, closes the day's cash.",
                "Views stock and own hours and pay. No chat access.",
            ],
        },
        {
            "role": "Stylist",
            "does": [
                "Sees own scheduled visits for the day; starts and completes the service.",
                "Chats with own customers; sees ratings anonymously and own earnings.",
                "Cannot see customer phone numbers.",
            ],
        },
        {
            "role": "Admin",
            "does": [
                "Manages staff, services, stock, marketing, content and settings.",
                "Runs payroll (draft, adjust, approve, mark paid) and approves refunds.",
                "Reviews reports, staff summaries and the audit log. No access to chats.",
            ],
        },
    ],
    "stack": [
        {
            "layer": "Front end",
            "items": [
                "React 18",
                "TypeScript",
                "Vite",
                "Tailwind CSS",
                "React Router",
                "TanStack Query",
            ],
        },
        {
            "layer": "Back end",
            "items": [
                "Django 5",
                "Django REST Framework",
                "SimpleJWT cookies",
                "Channels (Daphne)",
            ],
        },
        {"layer": "Data", "items": ["PostgreSQL", "Field-level encryption", "Audit log"]},
        {"layer": "Tests", "items": ["pytest", "Vitest", "Playwright", "axe-core"]},
    ],
    "security": [
        "Passwords hashed with Argon2; five failed sign-ins lock the account for 15 minutes.",
        "Short-lived access tokens and rotating refresh tokens in httpOnly cookies, with CSRF protection; nothing in local storage.",
        "One policy file decides each role's menus, pages and API actions; the server enforces it.",
        "Phone numbers, allergies, notes and chat messages are encrypted in the database.",
        "Every sign-in, price change, refund, invite, export and publish step is written to the audit log.",
    ],
}

MAPPING = [
    {
        "workflow": "Online booking requests",
        "built": (
            "Public site with services, options and prices; sign in to book; a request that the "
            "desk and the stylist must both accept, a hold on the stylist's slot, a payment link "
            "and a hold that expires."
        ),
        "not_built": "Single shop. The payment gateway and the emailed link are simulated.",
    },
    {
        "workflow": "Scheduling and the calendar",
        "built": (
            "Day schedule by stylist and room, overlap-safe booking, three nearest free times on "
            "a clash, and a waitlist that offers freed slots."
        ),
        "not_built": "One location; no multi-centre scheduling.",
    },
    {
        "workflow": "Guest check-in and service",
        "built": (
            "Customer I'm here flag, desk check-in, and the stylist starting and completing own "
            "visits only."
        ),
        "not_built": "No self check-in kiosk.",
    },
    {
        "workflow": "Point of sale and billing",
        "built": (
            "Invoices with GST, tips, capped discounts, retail items, loyalty points, cash close "
            "and admin-approved refunds. Paid invoices cannot be edited."
        ),
        "not_built": "Payments are simulated; no card terminal or real gateway.",
    },
    {
        "workflow": "Inventory",
        "built": "A stock ledger of every movement, purchasing, and retail products on bills.",
        "not_built": "One stock location; no transfers between stores.",
    },
    {
        "workflow": "Packages, memberships, gift cards and coupons",
        "built": "Packages and memberships with cancel and renew rules, gift cards, credits and coupons.",
        "not_built": "Online payments for these are simulated.",
    },
    {
        "workflow": "Marketing and messages",
        "built": "Campaigns, coupons and an unsubscribe link, with a developer mailbox to read them.",
        "not_built": "Email, SMS and WhatsApp are simulated; nothing is sent to a real person.",
    },
    {
        "workflow": "Staff pay, hours and ratings",
        "built": (
            "Pay from per-service task rates and a rating multiplier plus tips, receptionist "
            "hours, payroll runs, performance reviews and staff summary graphs."
        ),
        "not_built": "No statutory deductions (PF, ESI, TDS); payouts are marked paid by hand.",
    },
    {
        "workflow": "Reports and insights",
        "built": "Admin reports, staff summaries, and Chatbot insights showing what customers asked.",
        "not_built": "The statistics-based admin assistant is planned, not built yet.",
    },
    {
        "workflow": "Customer assistant",
        "built": "A rule-based chatbot that answers only from the shop's own data and the signed-in user's own records.",
        "not_built": "It is not a language model; its accuracy is measured, and limited (see Engineering decisions).",
    },
    {
        "workflow": "Roles, security and audit",
        "built": "Four roles with strict isolation, encryption of sensitive fields, and an audit log.",
        "not_built": "Single tenant: one business per installation.",
    },
]

DECISIONS = [
    {
        "title": "One policy file for every role",
        "body": (
            "Menus, pages and API actions for the four roles come from a single JSON file that "
            "both the front end and the server read. Hidden actions are removed, not just "
            "disabled, and tests cover both allowed and denied access, including direct API calls."
        ),
        "where": [
            "shared/policy.json",
            "backend/core/policy.py",
            "frontend/src/policy/policy.ts",
            "backend/core/tests/test_policy.py",
        ],
    },
    {
        "title": "Booking that cannot double-book",
        "body": (
            "Creating or moving an appointment runs in one database transaction with row locks "
            "and an overlap check. A clash returns 409 with the three nearest free times."
        ),
        "where": ["backend/scheduling/booking.py"],
    },
    {
        "title": "Encrypted fields you can still search",
        "body": (
            "Sensitive fields are stored as AES-GCM ciphertext tied to their column. Phone search "
            "uses a keyed hash (a blind index), so the number itself is never stored in the clear."
        ),
        "where": ["backend/core/crypto.py", "backend/core/fields.py"],
    },
    {
        "title": "Immutable invoices and a stock ledger",
        "body": (
            "A paid invoice is never edited; a correction is a refund. Stock is a ledger of "
            "movements, so every quantity can be explained from its history."
        ),
        "where": [
            "backend/billing/models.py",
            "backend/billing/refunds.py",
            "backend/inventory/models.py",
        ],
    },
    {
        "title": "A chatbot without a language model, and honest accuracy",
        "body": (
            "The assistant is a deterministic rule engine over the shop's own data, with no "
            "external service. On questions I wrote myself it scored 120 of 130 (92.3%) on the "
            "set I tuned against and 63 of 78 (80.8%) on a holdout set; real customers will "
            "phrase things differently, so expect lower in practice."
        ),
        "where": [
            "backend/chatbot/engine/",
            "backend/chatbot/tests/test_accuracy.py",
            "docs/CHATBOT_ALGORITHM.md",
        ],
    },
    {
        "title": "A statistics-based admin assistant (planned)",
        "body": (
            "The admin assistant, Alankar Intelligence, is planned and not built yet. It is "
            "designed as statistics and rules over the shop's own numbers, with no model and no "
            "outside calls."
        ),
        "where": ["docs/PROGRESS.md", "docs/MASTER_NOTES.md"],
    },
    {
        "title": "Everything that changes is audited",
        "body": (
            "Sign-ins, price and role changes, refunds, invites, exports, rating exclusions, "
            "payroll steps and content publishing each write an audit entry that admins can read."
        ),
        "where": ["backend/accounts/audit.py", "backend/accounts/models.py"],
    },
]
