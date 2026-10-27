"""Demo content for development and the demo video (Indian salon, prices in INR incl. GST).

Everything here is sample data to replace with the owner's real content in the admin
screens (Task 5). Ratings, reviews, achievements and offers are NOT seeded: they must come
from real activity or from the owner.
"""

# (division, category, services); each service:
# (name, audience, minutes, price, summary, variants, addons, tags)
CATALOGUE = [
    (
        "salon",
        "Haircuts",
        [
            (
                "Men's Haircut",
                "men",
                30,
                300,
                "Classic or modern cut with a wash and style.",
                [],
                [],
                ["haircut", "men"],
            ),
            (
                "Women's Haircut",
                "women",
                45,
                500,
                "Cut and finish to suit your hair length.",
                [("Short hair", 500, 45), ("Medium hair", 700, 60), ("Long hair", 900, 75)],
                [],
                ["haircut"],
            ),
            (
                "Kids' Haircut",
                "kids",
                25,
                200,
                "Gentle, quick haircut for children under 12.",
                [],
                [],
                ["kids"],
            ),
            (
                "Beard Trim & Shape",
                "men",
                20,
                150,
                "Trim, line-up and hot-towel finish.",
                [],
                [],
                ["beard", "grooming"],
            ),
        ],
    ),
    (
        "salon",
        "Hair Colour",
        [
            (
                "Global Hair Colour",
                "unisex",
                120,
                1800,
                "Full-head colour with ammonia-free options.",
                [("Short hair", 1800, 90), ("Medium hair", 2500, 120), ("Long hair", 3200, 150)],
                [("Bond-repair treatment", 800, 20)],
                ["colour"],
            ),
            (
                "Root Touch-up",
                "unisex",
                60,
                1200,
                "Colour for regrowth up to 1 inch.",
                [],
                [],
                ["colour"],
            ),
        ],
    ),
    (
        "salon",
        "Hair Treatments",
        [
            (
                "Hair Spa",
                "unisex",
                45,
                900,
                "Deep-conditioning treatment with a relaxing massage.",
                [("Short hair", 900, 45), ("Medium hair", 1200, 60), ("Long hair", 1500, 75)],
                [],
                ["treatment"],
            ),
            (
                "Keratin Smoothening",
                "unisex",
                180,
                4000,
                "Smoother, frizz-free hair for weeks.",
                [("Short hair", 4000, 150), ("Medium hair", 5500, 180), ("Long hair", 7000, 210)],
                [],
                ["treatment"],
            ),
            (
                "Blow-dry & Styling",
                "women",
                45,
                600,
                "Wash, blow-dry and a finished style.",
                [],
                [],
                ["styling"],
            ),
        ],
    ),
    (
        "spa",
        "Massages",
        [
            (
                "Swedish Massage",
                "unisex",
                60,
                2000,
                "Full-body relaxation massage with light pressure.",
                [("60 minutes", 2000, 60), ("90 minutes", 2800, 90)],
                [],
                ["massage", "relax"],
            ),
            (
                "Deep Tissue Massage",
                "unisex",
                60,
                2400,
                "Firm pressure to release muscle tension.",
                [("60 minutes", 2400, 60), ("90 minutes", 3200, 90)],
                [],
                ["massage"],
            ),
            (
                "Head, Neck & Shoulder",
                "unisex",
                30,
                900,
                "Quick relief for desk-bound stress.",
                [],
                [],
                ["massage"],
            ),
            (
                "Foot Reflexology",
                "unisex",
                45,
                1000,
                "Pressure-point foot therapy.",
                [],
                [],
                ["massage", "feet"],
            ),
        ],
    ),
    (
        "spa",
        "Body Treatments",
        [
            (
                "Body Scrub & Polish",
                "unisex",
                60,
                2200,
                "Exfoliation and polish for glowing skin.",
                [],
                [],
                ["body"],
            ),
        ],
    ),
    (
        "beauty-parlor",
        "Skin",
        [
            (
                "Classic Facial",
                "unisex",
                60,
                1200,
                "Cleanse, exfoliate, massage and mask.",
                [],
                [],
                ["facial", "skin"],
            ),
            (
                "De-tan Facial",
                "unisex",
                60,
                1500,
                "Brightening facial to reduce tan.",
                [],
                [],
                ["facial", "skin"],
            ),
        ],
    ),
    (
        "beauty-parlor",
        "Makeup",
        [
            (
                "Party Makeup",
                "women",
                90,
                3500,
                "Event-ready makeup and a simple hairdo.",
                [],
                [],
                ["makeup"],
            ),
            (
                "Bridal Makeup",
                "women",
                180,
                15000,
                "Complete bridal look for your big day.",
                [],
                [("Saree draping", 1500, 20), ("Bridal hairdo", 2500, 45)],
                ["makeup", "bridal"],
            ),
        ],
    ),
    (
        "beauty-parlor",
        "Nails",
        [
            (
                "Manicure",
                "unisex",
                45,
                600,
                "Nail shaping, cuticle care and polish.",
                [],
                [],
                ["nails"],
            ),
            (
                "Pedicure",
                "unisex",
                60,
                800,
                "Soak, scrub, nail care and polish.",
                [],
                [],
                ["nails"],
            ),
            (
                "Gel Nail Extensions",
                "women",
                90,
                2000,
                "Durable gel extensions with your choice of finish.",
                [],
                [],
                ["nails"],
            ),
        ],
    ),
    (
        "beauty-parlor",
        "Waxing & Threading",
        [
            (
                "Full Arms Waxing",
                "women",
                30,
                500,
                "Smooth arms with gentle wax.",
                [],
                [],
                ["waxing"],
            ),
            ("Eyebrow Threading", "unisex", 15, 80, "Precise brow shaping.", [], [], ["threading"]),
        ],
    ),
]

TEAM = [
    ("Rahul", "Senior Hair Stylist", "Cuts, colour and keratin", ["salon"]),
    ("Arun", "Barber & Grooming Expert", "Fades, beard design and hot-towel shaves", ["salon"]),
    ("Kiran", "Spa Therapist", "Swedish, deep tissue and reflexology", ["spa"]),
    (
        "Priya",
        "Beauty & Bridal Artist",
        "Bridal and party makeup, facials and nails",
        ["beauty-parlor"],
    ),
]

SITE_CONTENT = {
    "hero": {
        "headline": "Look good. Feel calm.",
        "subtitle": (
            "Hair, spa and beauty under one roof. Send a booking request, we confirm your "
            "stylist and time, and you pay securely with the link we send you."
        ),
    },
    "about": {
        "heading": "About us",
        "body": (
            "We are a unisex salon, spa and beauty parlor. Our team takes care of everything "
            "from a quick haircut to a complete bridal look, with hygiene, comfort and your "
            "time as our priorities."
        ),
    },
    "contact": {
        "address": "Demo address, Vijayawada, Andhra Pradesh",
        "phone": "+91 90000 00000",
        "email": "hello@example.com",
        "map_url": "https://www.google.com/maps/search/?api=1&query=Vijayawada",
    },
    "hours": [
        {"days": "Monday – Saturday", "open": "10:00", "close": "20:00"},
        {"days": "Sunday", "open": "10:00", "close": "18:00"},
    ],
    "social": [],
    "video": {"url": ""},
    "booking": {
        "slot_step_minutes": 15,
        "min_lead_minutes": 60,
        "max_days_ahead": 60,
        "hold_hours": 6,
        "deposit_percent": 100,
        "free_cancel_hours": 24,
        "gst_percent": 18,
        "weekly_hours": {
            "mon": ["10:00", "20:00"],
            "tue": ["10:00", "20:00"],
            "wed": ["10:00", "20:00"],
            "thu": ["10:00", "20:00"],
            "fri": ["10:00", "20:00"],
            "sat": ["10:00", "20:00"],
            "sun": ["10:00", "18:00"],
        },
    },
    "policies": {
        "cancellation": (
            "You can cancel free of charge up to 24 hours before your appointment; the "
            "prepayment is refunded. Later cancellations are not refunded unless the salon "
            "approves it. There is no fee for a missed appointment.\n\n"
            "If a payment link is not paid in time, the held slot is released."
        ),
        "privacy": (
            "We store only what we need to run your bookings: your name, email, mobile "
            "number and visit history. Your mobile number is encrypted. Stylists never see "
            "your phone number. You can ask us to export or delete your data at any time.\n\n"
            "(Draft text for the demo; the owner will replace it.)"
        ),
        "terms": (
            "Bookings are requests until the salon confirms them and you pay the payment "
            "link. Prices shown include GST.\n\n(Draft text for the demo; the owner will "
            "replace it.)"
        ),
    },
}

FAQS = [
    (
        "How do I book an appointment?",
        "Pick a service, choose your preferred time and stylist, and send a booking request. "
        "Our front desk confirms your stylist and time, then emails you a payment link.",
    ),
    (
        "When do I pay?",
        "After we confirm your request you receive a payment link. Your slot is held for 6 "
        "hours (less if the appointment is sooner); pay online to lock it in.",
    ),
    (
        "Can I cancel or reschedule?",
        "Yes. Cancel free of charge up to 24 hours before your appointment, or request a new "
        "time from My Appointments.",
    ),
    (
        "Can I choose my stylist?",
        "Yes, choose any stylist qualified for the service, or pick 'Any available'.",
    ),
    (
        "Do you serve men, women and kids?",
        "Yes. We are a unisex salon, spa and beauty parlor; use the Men, Women and Kids filters "
        "on each page.",
    ),
]


# Demo rooms: (name, division)
ROOMS = [
    ("Salon chair 1", "salon"),
    ("Salon chair 2", "salon"),
    ("Salon chair 3", "salon"),
    ("Spa room 1", "spa"),
    ("Spa room 2", "spa"),
    ("Parlor room 1", "beauty-parlor"),
    ("Parlor room 2", "beauty-parlor"),
]


# Retail products sold at the counter: (sku, name, category, price incl. GST in INR, GST %,
# opening stock, low-stock level). Stock enters through the ledger as "opening" movements.
PRODUCTS = [
    ("SHP-001", "Nourishing Shampoo 250 ml", "Hair care", 450, 18, 24, 6),
    ("CND-001", "Smoothing Conditioner 250 ml", "Hair care", 480, 18, 20, 6),
    ("SRM-001", "Argan Hair Serum 100 ml", "Hair care", 650, 18, 14, 4),
    ("HMK-001", "Hair Mask Repair 200 g", "Hair care", 720, 18, 10, 4),
    ("CLR-001", "Hair Colour Natural Brown", "Hair colour", 380, 18, 18, 6),
    ("CLR-002", "Hair Colour Deep Black", "Hair colour", 380, 18, 18, 6),
    ("FWS-001", "Gentle Face Wash 100 ml", "Skin care", 350, 18, 22, 6),
    ("FKT-001", "Glow Facial Kit", "Skin care", 899, 18, 9, 3),
    ("SUN-001", "Sunscreen SPF 50 60 ml", "Skin care", 550, 18, 12, 4),
    ("MOL-001", "Relaxing Massage Oil 200 ml", "Spa", 600, 18, 11, 3),
    ("WAX-001", "Warm Wax Cartridge", "Waxing", 420, 18, 16, 5),
    ("NLP-001", "Nail Polish Ruby Red", "Nails", 250, 18, 25, 8),
    ("NLP-002", "Nail Polish Nude Rose", "Nails", 250, 18, 25, 8),
    ("CMB-001", "Wide-tooth Comb", "Accessories", 120, 12, 30, 10),
]
