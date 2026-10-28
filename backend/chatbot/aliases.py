"""Default search words (aliases) for the demo service names, merged with each service's `tags`.

The engine finds a service when all the words of one of its aliases appear in a question.
Admins can add their own aliases in the service's tags; nothing here needs a database change.
"""

DEFAULT_ALIASES = {
    "Men's Haircut": [
        "men haircut",
        "mens hair cut",
        "gents haircut",
        "haircut",
        "hair cut",
        "trim",
    ],
    "Women's Haircut": ["women haircut", "ladies haircut", "haircut", "hair cut"],
    "Kids' Haircut": ["kids haircut", "child haircut", "kids hair cut"],
    "Beard Trim & Shape": ["beard", "beard trim", "shave", "shaving"],
    "Global Hair Colour": ["hair colour", "global colour", "hair color", "colour", "dye"],
    "Root Touch-up": ["root touch up", "root colour", "touch up", "roots"],
    "Hair Spa": ["hair spa", "hairspa"],
    "Keratin Smoothening": ["keratin", "smoothening", "smoothing", "straightening"],
    "Blow-dry & Styling": ["blow dry", "blowdry", "styling", "hair styling"],
    "Swedish Massage": ["swedish massage", "swedish", "body massage", "massage"],
    "Deep Tissue Massage": ["deep tissue", "deep tissue massage", "body massage", "massage"],
    "Head, Neck & Shoulder": ["head massage", "head neck shoulder", "shoulder massage", "massage"],
    "Foot Reflexology": ["foot reflexology", "foot massage", "reflexology", "massage"],
    "Body Scrub & Polish": ["body scrub", "body polish", "scrub"],
    "Classic Facial": ["classic facial", "facial"],
    "De-tan Facial": ["detan facial", "de tan", "detan", "facial"],
    "Party Makeup": ["party makeup", "makeup"],
    "Bridal Makeup": ["bridal makeup", "bridal", "bride makeup", "makeup"],
    "Manicure": ["manicure", "nails", "nail care"],
    "Pedicure": ["pedicure", "nails", "foot care"],
    "Gel Nail Extensions": ["gel nails", "nail extension", "nail extensions", "nails"],
    "Full Arms Waxing": ["arm wax", "arms waxing", "waxing", "wax"],
    "Eyebrow Threading": ["eyebrow", "eyebrow threading", "threading"],
}

# Tags that describe a person group or a mood, not a thing to book: never used as an alias.
NOT_ALIASES = {"men", "women", "kids", "unisex", "relax", "skin", "grooming", "treatment", "body"}
