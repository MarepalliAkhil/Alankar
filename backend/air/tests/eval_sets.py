"""AIR booking and order utterances with the structured result we expect from the rule-based
reader (air/understand.py). Written by the developer, NOT real customer messages.

TUNING may be used to improve the rules. HOLDOUT was written at the same time and must never be
used for tuning: only measured and reported.

All dates are relative to NOW = Sunday 8 November 2026, 10:00 Asia/Kolkata, against the demo
catalogue (`seed_demo`). Fields (all optional; only the given ones are checked):
  intent        book | availability | hours | price | status | reschedule | cancel |
                order_product | visit_product | order_update | order_status | person | greeting
  services      exact set of service names the reader must settle on
  services_any  the reader must ask "which one?": 2+ candidates, all from this list
  day           days after NOW (0 = today), or "week" for "next week"
  time          "HH:MM" exact, a window name (morning/afternoon/evening), "after HH:MM",
                "before HH:MM"
  stylist       first name in lower case, or "any"
  products      exact set of product names
  quantity      integer
"""

HAIRCUTS = ["Men's Haircut", "Women's Haircut", "Kids' Haircut"]
FACIALS = ["Classic Facial", "De-tan Facial"]
MASSAGES = ["Swedish Massage", "Deep Tissue Massage", "Head, Neck & Shoulder", "Foot Reflexology"]

TUNING = [
    (
        "book a men's haircut tomorrow at 11am with rahul",
        {
            "intent": "book",
            "services": {"Men's Haircut"},
            "day": 1,
            "time": "11:00",
            "stylist": "rahul",
        },
    ),
    (
        "I want a facial on saturday evening",
        {"intent": "book", "services_any": FACIALS, "day": 6, "time": "evening"},
    ),
    (
        "kal evening haircut kavali",
        {"intent": "book", "services_any": HAIRCUTS, "day": 1, "time": "evening"},
    ),
    (
        "mujhe kal subah beard trim chahiye",
        {"intent": "book", "services": {"Beard Trim & Shape"}, "day": 1, "time": "morning"},
    ),
    (
        "hair spa this saturday after 5",
        {"intent": "book", "services": {"Hair Spa"}, "day": 6, "time": "after 17:00"},
    ),
    (
        "can i get a pedicure on 14/11 at 3pm",
        {"intent": "book", "services": {"Pedicure"}, "day": 6, "time": "15:00"},
    ),
    (
        "swedish massage monday afternoon with priya",
        {
            "intent": "book",
            "services": {"Swedish Massage"},
            "day": 1,
            "time": "afternoon",
            "stylist": "priya",
        },
    ),
    (
        "any free slots today for manicure",
        {"intent": "availability", "services": {"Manicure"}, "day": 0},
    ),
    ("what time do you open", {"intent": "hours"}),
    ("how much is keratin smoothening", {"intent": "price", "services": {"Keratin Smoothening"}}),
    ("where is my request", {"intent": "status"}),
    ("cancel my booking", {"intent": "cancel"}),
    ("reschedule my appointment to friday", {"intent": "reschedule", "day": 5}),
    ("talk to a person", {"intent": "person"}),
    ("buy argan hair serum", {"intent": "order_product", "products": {"Argan Hair Serum 100 ml"}}),
    (
        "2 nourishing shampoo please",
        {"intent": "order_product", "products": {"Nourishing Shampoo 250 ml"}, "quantity": 2},
    ),
    ("where is my order", {"intent": "order_status"}),
    (
        "add a wide tooth comb to my appointment",
        {"intent": "visit_product", "products": {"Wide-tooth Comb"}},
    ),
    ("bridal makeup on 20 nov", {"intent": "book", "services": {"Bridal Makeup"}, "day": 12}),
    ("eyebrow threding tomorow", {"intent": "book", "services": {"Eyebrow Threading"}, "day": 1}),
    (
        "hiar colour next week",
        {"intent": "book", "services": {"Global Hair Colour"}, "day": "week"},
    ),
    (
        "deep tisue massage wednesday 6pm",
        {"intent": "book", "services": {"Deep Tissue Massage"}, "day": 3, "time": "18:00"},
    ),
    (
        "kids haircut on thursday morning",
        {"intent": "book", "services": {"Kids' Haircut"}, "day": 4, "time": "morning"},
    ),
    (
        "repu sayantram facial cheyinchukovali",
        {"intent": "book", "services_any": FACIALS, "day": 1, "time": "evening"},
    ),
    (
        "ee roju gel nails slot undha",
        {"intent": "availability", "services": {"Gel Nail Extensions"}, "day": 0},
    ),
    (
        "aaj shaam ko head massage",
        {"intent": "book", "services": {"Head, Neck & Shoulder"}, "day": 0, "time": "evening"},
    ),
    (
        "body scrub with kiran on tuesday",
        {"intent": "book", "services": {"Body Scrub & Polish"}, "day": 2, "stylist": "kiran"},
    ),
    (
        "any stylist is fine, waxing tomorrow 4pm",
        {
            "intent": "book",
            "services": {"Full Arms Waxing"},
            "day": 1,
            "time": "16:00",
            "stylist": "any",
        },
    ),
    ("what are your timings on sunday", {"intent": "hours"}),
    ("price of root touch up", {"intent": "price", "services": {"Root Touch-up"}}),
    ("is my booking accepted yet", {"intent": "status"}),
    ("i want to cancel my request for tomorrow", {"intent": "cancel"}),
    ("can you move my facial to next week", {"intent": "reschedule", "day": "week"}),
    ("i need to speak to the receptionist", {"intent": "person"}),
    (
        "order 3 nail polish ruby red",
        {"intent": "order_product", "products": {"Nail Polish Ruby Red"}, "quantity": 3},
    ),
    ("status of my order", {"intent": "order_status"}),
    ("change my order quantity to 1", {"intent": "order_update"}),
    (
        "blow dry tomorrow before 12",
        {"intent": "book", "services": {"Blow-dry & Styling"}, "day": 1, "time": "before 12:00"},
    ),
    (
        "foot reflexology on the 15th",
        {"intent": "book", "services": {"Foot Reflexology"}, "day": 7},
    ),
    (
        "massage friday evening",
        {"intent": "book", "services_any": MASSAGES, "day": 5, "time": "evening"},
    ),
    (
        "party makup on saturday 5:30 pm",
        {"intent": "book", "services": {"Party Makeup"}, "day": 6, "time": "17:30"},
    ),
    (
        "gents haircut with arun day after tomorrow",
        {"intent": "book", "services": {"Men's Haircut"}, "day": 2, "stylist": "arun"},
    ),
    (
        "ladies haircut kal 3 baje",
        {"intent": "book", "services": {"Women's Haircut"}, "day": 1, "time": "15:00"},
    ),
    ("sunscreen kavali", {"intent": "order_product", "products": {"Sunscreen SPF 50 60 ml"}}),
    ("mujhe glow facial kit chahiye", {"intent": "order_product", "products": {"Glow Facial Kit"}}),
    ("buy massage oil", {"intent": "order_product", "products": {"Relaxing Massage Oil 200 ml"}}),
    ("hello", {"intent": "greeting"}),
    ("detan facial tmrw", {"intent": "book", "services": {"De-tan Facial"}, "day": 1}),
    ("book appointment", {"intent": "book"}),
    ("free slots tomorrow", {"intent": "availability", "day": 1}),
    ("how much for a hair spa", {"intent": "price", "services": {"Hair Spa"}}),
    ("my requests", {"intent": "status"}),
    ("my orders", {"intent": "order_status"}),
    ("cancel my order", {"intent": "order_update"}),
    ("call me back please", {"intent": "person"}),
]

HOLDOUT = [
    (
        "need a kids haircut on friday at 4pm",
        {"intent": "book", "services": {"Kids' Haircut"}, "day": 5, "time": "16:00"},
    ),
    (
        "book swedish massage on 16/11 morning",
        {"intent": "book", "services": {"Swedish Massage"}, "day": 8, "time": "morning"},
    ),
    ("parso beard trim chahiye", {"intent": "book", "services": {"Beard Trim & Shape"}, "day": 2}),
    (
        "repu morning manicure",
        {"intent": "book", "services": {"Manicure"}, "day": 1, "time": "morning"},
    ),
    (
        "whats the cost of gel nail extensions",
        {"intent": "price", "services": {"Gel Nail Extensions"}},
    ),
    ("are you open on saturday", {"intent": "hours"}),
    ("pls cancel my appointment", {"intent": "cancel"}),
    ("i want to change my booking time", {"intent": "reschedule"}),
    ("connect me to someone at the desk", {"intent": "person"}),
    ("is my payment done for the order", {"intent": "order_status"}),
    (
        "buy 2 hair mask",
        {"intent": "order_product", "products": {"Hair Mask Repair 200 g"}, "quantity": 2},
    ),
    (
        "hair colour deep black kavali",
        {"intent": "order_product", "products": {"Hair Colour Deep Black"}},
    ),
    (
        "keratin with priya next week",
        {"intent": "book", "services": {"Keratin Smoothening"}, "day": "week", "stylist": "priya"},
    ),
    (
        "facial at 2:30 pm tomorrow",
        {"intent": "book", "services_any": FACIALS, "day": 1, "time": "14:30"},
    ),
    (
        "any slot for head massage after 6 today",
        {
            "intent": "availability",
            "services": {"Head, Neck & Shoulder"},
            "day": 0,
            "time": "after 18:00",
        },
    ),
    ("pedicur on wensday", {"intent": "book", "services": {"Pedicure"}, "day": 3}),
    ("massge thursday", {"intent": "book", "services_any": MASSAGES, "day": 4}),
    (
        "deep tissue sat evening",
        {"intent": "book", "services": {"Deep Tissue Massage"}, "day": 6, "time": "evening"},
    ),
    (
        "Global colour on 21st nov at 11 am",
        {"intent": "book", "services": {"Global Hair Colour"}, "day": 13, "time": "11:00"},
    ),
    (
        "ee saturday sayantram bridal makeup",
        {"intent": "book", "services": {"Bridal Makeup"}, "day": 6, "time": "evening"},
    ),
    (
        "aaj dopahar ko threading ho sakta hai?",
        {"services": {"Eyebrow Threading"}, "day": 0, "time": "afternoon"},
    ),
    ("status of my booking request", {"intent": "status"}),
    ("where's my parcel", {"intent": "order_status"}),
    ("remove the comb from my order", {"intent": "order_update"}),
    (
        "add sunscreen to my next visit",
        {"intent": "visit_product", "products": {"Sunscreen SPF 50 60 ml"}},
    ),
    ("what time do you close today", {"intent": "hours"}),
    ("how much is party makeup", {"intent": "price", "services": {"Party Makeup"}}),
    (
        "book men's haircut with kiran tomorrow evening",
        {
            "intent": "book",
            "services": {"Men's Haircut"},
            "day": 1,
            "time": "evening",
            "stylist": "kiran",
        },
    ),
    (
        "women haircut monday 10:30",
        {"intent": "book", "services": {"Women's Haircut"}, "day": 1, "time": "10:30"},
    ),
    (
        "anyone is ok, hair spa friday 5 pm",
        {"intent": "book", "services": {"Hair Spa"}, "day": 5, "time": "17:00", "stylist": "any"},
    ),
    (
        "foot massage tomorow evng",
        {"intent": "book", "services": {"Foot Reflexology"}, "day": 1, "time": "evening"},
    ),
    ("body polish on 18/11", {"intent": "book", "services": {"Body Scrub & Polish"}, "day": 10}),
    (
        "root touchup before 1 pm on tuesday",
        {"intent": "book", "services": {"Root Touch-up"}, "day": 2, "time": "before 13:00"},
    ),
    (
        "i'd like to order the face wash",
        {"intent": "order_product", "products": {"Gentle Face Wash 100 ml"}},
    ),
    (
        "conditioner 2 bottles",
        {"intent": "order_product", "products": {"Smoothing Conditioner 250 ml"}, "quantity": 2},
    ),
    ("track my order", {"intent": "order_status"}),
    ("reschedule to saturday afternoon", {"intent": "reschedule", "day": 6, "time": "afternoon"}),
    ("i dont want my booking anymore", {"intent": "cancel"}),
    ("human please", {"intent": "person"}),
    (
        "slots available on wednesday for waxing",
        {"intent": "availability", "services": {"Full Arms Waxing"}, "day": 3},
    ),
    (
        "blowdry n styling sat morning",
        {"intent": "book", "services": {"Blow-dry & Styling"}, "day": 6, "time": "morning"},
    ),
    (
        "nail polish nude rose 1 qty",
        {"intent": "order_product", "products": {"Nail Polish Nude Rose"}, "quantity": 1},
    ),
    (
        "kids hair cut tomorrow after 4 pm",
        {"intent": "book", "services": {"Kids' Haircut"}, "day": 1, "time": "after 16:00"},
    ),
    (
        "classic facial with priya on 19 nov 3pm",
        {
            "intent": "book",
            "services": {"Classic Facial"},
            "day": 11,
            "time": "15:00",
            "stylist": "priya",
        },
    ),
    ("detan", {"services": {"De-tan Facial"}}),
]
