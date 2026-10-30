# ruff: noqa: E501  (content data: long sentences are easier to edit unbroken)
"""Starting content for the For Zenotians page (Task 9). It is written to the database once (data
migration website.0003) and from then on edited ONLY in the admin content editor.

Sources of truth:
- resume: the owner's resume text, used exactly. Items the owner marked as TODO are NOT here: the
  fields exist (project "tech" and "outcome", education "result") and stay empty until the owner
  adds them in the editor.
- zenoti: only the facts the owner listed, each with its source link and last-checked date.
- project, mapping, decisions: written from this repository (README, MASTER_NOTES, PROGRESS.md and
  the code); the "where" pointers name real files.
- vision: a concept, clearly marked "not built".
"""

CHECKED = "2026-10-30"

RESUME = {
    "name": "AKHIL MAREPALLI",
    "location": "Vijayawada, India",
    "contacts": [
        {"key": "email", "label": "Email", "value": "akhimarepalli666@gmail.com", "public": True},
        {
            "key": "linkedin",
            "label": "LinkedIn",
            "value": "https://www.linkedin.com/in/akhil-marepalli-56694532b",
            "public": True,
        },
        {
            "key": "github",
            "label": "GitHub",
            "value": "https://github.com/MarepalliAkhil",
            "public": True,
        },
        {
            "key": "portfolio",
            "label": "Portfolio",
            "value": "https://my-portfolio-chi-two-w24shxfzm7.vercel.app/",
            "public": True,
        },
        {"key": "phone", "label": "Phone", "value": "+91-9063946939", "public": False},
    ],
    "summary": (
        "B.Tech CSE undergraduate (CGPA 8.7) with hands-on experience in Python/ML projects, "
        "full-stack development, and Linux and networking coursework (Red Hat RH134, Cisco, "
        "Aviatrix). Looking for a software or infrastructure role where I can build, deploy, "
        "and troubleshoot reliable systems."
    ),
    "education": [
        {
            "school": "KL University",
            "place": "Vijayawada",
            "period": "2023 to Present",
            "program": "B.Tech in Computer Science Engineering",
            "result": "CGPA 8.7",
        },
        {
            "school": "Sree Chaitanya Junior College",
            "place": "Khammam",
            "period": "2021 to 2023",
            "program": "Intermediate (TSBIE)",
            "result": "Marks 944",
        },
        {
            "school": "Sree Vidhyanikethan High School",
            "place": "Khammam",
            "period": "2021",
            "program": "SSC",
            "result": "CGPA 10.0",
        },
    ],
    "projects": [
        {
            "title": "W.A.N.D. Wizarding Assistant for Natural Dialogue",
            "url": "https://github.com/MarepalliAkhil/WAND.git",
            "tech": "",
            "note": "",
            "bullets": [
                "Built a web-based AI voice assistant with continuous voice recognition and "
                "command-driven automation.",
                "Implemented file handling, application control, and media execution features "
                "triggered by voice commands.",
                "Designed a responsive UI with dynamic interactions; managed the project with "
                "Git and GitHub.",
            ],
            "outcome": "",
        },
        {
            "title": "Predictive Fraud Prevention System Using ML for Streaming Data",
            "url": (
                "https://github.com/MarepalliAkhil/"
                "Predictive-Fraud-Prevention-System-Using-ML-for-Streaming-Data.git"
            ),
            "tech": "Python",
            "note": "",
            "bullets": [
                "Developed a machine learning fraud detection system for streaming transaction "
                "data using anomaly detection and predictive modeling.",
                "Trained and evaluated models in Python; integrated backend modules and "
                "REST-based workflows.",
            ],
            "outcome": "",
        },
        {
            "title": "NowCart, AI Recommendation Engine E-commerce Demo",
            "url": "https://github.com/MarepalliAkhil/NowCart.git",
            "tech": "React 18, TypeScript, Vite, Tailwind CSS, Zustand",
            "note": "Hackathon project",
            "bullets": [
                "Built the frontend for an e-commerce demo showcasing AI-driven product "
                "discovery, using AI-assisted development.",
                "Added a cart-page cross-sell section that suggests complementary items with "
                "explanations for each recommendation.",
            ],
            "outcome": "",
        },
    ],
    "experience": [
        {
            "role": "AI-ML Virtual Intern",
            "org": "EduSkills (AICTE), Google for Developers",
            "period": "Jul 2025 to Sep 2025",
            "bullets": [
                "Worked on supervised learning models, preprocessing, and model evaluation.",
                "Implemented Python-based machine learning workflows on real-world datasets.",
            ],
        },
        {
            "role": "Artificial Intelligence Intern",
            "org": "Edunet Foundation (AICTE)",
            "period": "Jun 2025 to Jul 2025",
            "bullets": [
                "Gained practical exposure to NLP concepts and intelligent system design.",
                "Completed hands-on labs involving AI workflows and model understanding.",
            ],
        },
    ],
    "skills": [
        {"group": "Languages", "items": ["Java", "Python", "C"]},
        {
            "group": "Web Development",
            "items": [
                "HTML",
                "CSS",
                "JavaScript",
                "TypeScript",
                "React (Basic)",
                "Bootstrap",
                "Tailwind CSS",
            ],
        },
        {
            "group": "Backend & Databases",
            "items": [
                "Spring Boot",
                "FastAPI",
                "Flask",
                "JDBC",
                "REST APIs",
                "SQL",
                "PostgreSQL",
                "MySQL",
            ],
        },
        {
            "group": "AI/ML",
            "items": ["Machine Learning", "NLP", "Data Preprocessing", "Model Evaluation"],
        },
        {
            "group": "Networking",
            "items": ["TCP/IP", "Networking Fundamentals", "Multicloud Networking"],
        },
        {
            "group": "Systems & Tools",
            "items": ["Linux (Red Hat)", "Git", "GitHub", "Postman", "Vercel"],
        },
        {
            "group": "Core Concepts",
            "items": [
                "Data Structures & Algorithms",
                "OOP",
                "DBMS",
                "Operating Systems",
                "MVC Architecture",
            ],
        },
    ],
    "certifications": [
        {
            "title": "Cisco Networking Essentials",
            "detail": "",
            "url": "https://drive.google.com/drive/folders/14pflARfAdiqLvcWfgDtEH1a0l-icHVX8?usp=drive_link",
        },
        {
            "title": "Aviatrix Certified Engineer (ACE)",
            "detail": "Multicloud Network Associate",
            "url": "https://drive.google.com/drive/folders/14pflARfAdiqLvcWfgDtEH1a0l-icHVX8?usp=drive_link",
        },
        {
            "title": "Red Hat System Administration II (RH134)",
            "detail": "Certificate of Attendance",
            "url": "https://drive.google.com/drive/folders/14pflARfAdiqLvcWfgDtEH1a0l-icHVX8?usp=drive_link",
        },
        {
            "title": "Cambridge Linguaskill General",
            "detail": "English, Average Score 161 (CEFR B2)",
            "url": "https://drive.google.com/drive/folders/14pflARfAdiqLvcWfgDtEH1a0l-icHVX8?usp=drive_link",
        },
    ],
    "achievements": [],
    "pdf_url": "",
}

COMPANY = "https://www.zenoti.com/company"

ZENOTI = {
    "label": "Public information from Zenoti's website",
    "last_checked": CHECKED,
    "founded_year": 2010,
    "founded_text": (
        "Founded in 2010 as ManageMySpa in Hyderabad, India, by brothers Sudheer and "
        "Dheeraj Koneru."
    ),
    "founded_source": COMPANY,
    "customers_text": "Over 30,000 spa, salon, medspa and fitness businesses",
    "customers_note": "Their page is undated, so this figure may have changed since it was written.",
    "customers_source": "https://zenoti.com/choose-zenoti",
    "leadership": [
        {"name": "Sudheer Koneru", "title": "Founder & CEO"},
        {"name": "Neal Singh", "title": "COO"},
        {"name": "Dheeraj Koneru", "title": "Founder & SVP, Global Product Sales"},
        {"name": "Anand Arvind", "title": "Founder & Chief Product Officer"},
        {"name": "Amita Tomkoria", "title": "EVP Finance"},
        {"name": "Sunil Koneru", "title": "Senior VP, Customer Experience"},
        {"name": "Matt Baer", "title": "General Manager, Fitness Sales"},
        {"name": "Anna Duke", "title": "General Manager, Australia & New Zealand"},
        {"name": "Sachin Kamat", "title": "GM, India, Middle East and South East Asia"},
    ],
    "leadership_source": "https://www.zenoti.com/company/zenoti-leadership",
    "offices": [
        "Bellevue (USA)",
        "Brisbane",
        "Dubai",
        "Hyderabad",
        "Jakarta",
        "Kuala Lumpur",
        "Manchester",
        "Manila",
        "Paris",
    ],
    "offices_source": COMPANY,
    "investors": [
        "Warburg Pincus",
        "Accel",
        "Tiger Global",
        "Steadview Capital",
        "Avataar Ventures",
    ],
    "investors_source": COMPANY,
}

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
        "front desk confirms it with a stylist, a time and a room, and a payment link follows. "
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
                "Confirms request cards with a stylist, time and room; checks guests in.",
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
            "Public site with services, options and prices; sign in to book; a request card the "
            "desk confirms with stylist, time and room; a payment link and a hold that expires."
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

_GUARDRAILS = [
    "Privacy: only the shop's own data is used.",
    "A person confirms before anything changes.",
    "Every suggestion and action goes in the audit log.",
    "Nothing leaves the shop without the customer's consent.",
]

VISION = {
    "intro": (
        "Alankar today uses no AI. This section is a concept for later, not a feature: nothing "
        "described here is built, and each idea would sit on top of the rule-based engine the "
        "app already has."
    ),
    "roles": [
        {
            "role": "Customer",
            "data_in": [
                "Questions in the chat",
                "Own bookings and packages",
                "Reference photos the customer chooses to share",
            ],
            "today": ["Rule-based chatbot", "Package and coupon helpers"],
            "future": ["Style matching from reference photos", "Smart rebooking prompts"],
            "guardrails": _GUARDRAILS,
        },
        {
            "role": "Receptionist",
            "data_in": ["Day schedule", "Waitlist", "Past no-shows and cancellations"],
            "today": ["Waitlist offers for freed slots"],
            "future": ["Gap filling", "No-show risk alerts", "Schedule suggestions"],
            "guardrails": _GUARDRAILS,
        },
        {
            "role": "Stylist",
            "data_in": [
                "Own booked visit",
                "The customer's own history with the shop",
                "Reference photos",
            ],
            "today": ["Day view of own scheduled visits"],
            "future": ["A short prep summary before each visit"],
            "guardrails": _GUARDRAILS,
        },
        {
            "role": "Admin",
            "data_in": ["Sales, stock and staff numbers", "Chatbot questions that found no answer"],
            "today": [
                "Reports and Chatbot insights",
                "Alankar Intelligence (statistics and rules) is planned, not built yet",
            ],
            "future": ["Forecasts", "Drafts of plans for the admin to edit"],
            "guardrails": _GUARDRAILS,
        },
    ],
    "overview_note": "All four roles would share the same guardrails, and a person would always have the last word.",
}

DEMO = {"logins": [], "guide": []}

SEED = {
    "overview": OVERVIEW,
    "resume": RESUME,
    "zenoti": ZENOTI,
    "project": PROJECT,
    "mapping": MAPPING,
    "decisions": DECISIONS,
    "vision": VISION,
    "demo": DEMO,
}
