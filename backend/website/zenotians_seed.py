# ruff: noqa: E501  (content data: long sentences are easier to edit unbroken)
"""Starting content for the For Zenotians page (Task 9). It is written to the database once (data
migration website.0003) and from then on edited ONLY in the admin content editor.

Sources of truth:
- resume: the owner's resume text, used exactly. Items the owner marked as TODO are NOT here: the
  fields exist (project "tech" and "outcome", education "result") and stay empty until the owner
  adds them in the editor.
- zenoti: only the facts the owner listed, each with its source link and last-checked date.
- project, mapping: written from this repository (README, MASTER_NOTES, PROGRESS.md and
  the code); the "where" pointers name real files.
- story, quality, security, limitations (Task 16): written from this repository and checked
  by tests: every code pointer must be a real file, the accuracy numbers must equal a fresh measurement,
  and every mapping row must point at a real limitation.
"""

CHECKED = "2026-10-30"
MEASURED = "2026-11-05"

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
        "full-stack development, and Linux and networking coursework (Red Hat RH134, Cisco). "
        "Looking for a software or infrastructure role where I can build, deploy, and "
        "troubleshoot reliable systems."
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

LEADERS_PAGE = "https://www.zenoti.com/company/zenoti-leadership"
LEADERS_CHECKED = "2026-11-07"

LEADERS = [
    {
        "name": "Sudheer Koneru",
        "title": "Founder & CEO",
        "bio": [
            "Founded Zenoti in 2010 (it began as ManageMySpa) and leads the company as CEO.",
            "Earlier in his career he worked at Microsoft.",
            "He was also CEO of Intelliprep, which merged into SumTotal Systems.",
            "Zenoti's website says his leadership made it the first unicorn in its industry, and that it powers over 30,000 businesses worldwide.",
            "He holds degrees from IIT Madras and the University of Texas at Austin.",
        ],
        "sources": [LEADERS_PAGE],
        "last_checked": LEADERS_CHECKED,
        "photo": "",
        "photo_credit": "",
    },
    {
        "name": "Neal Singh",
        "title": "COO",
        "bio": [
            "Runs global operations at Zenoti, including product development, engineering, implementation, customer success and support.",
            "Zenoti announced his appointment as President and COO in November 2023, and said he would also oversee its investments in payments and fintech.",
            "He was previously COO at Icertis.",
            "Before that he was President and CEO of Caradigm, a GE Healthcare company.",
            "He spent over a decade at Microsoft, helping build its Dynamics enterprise ERP portfolio, and has more than 20 years in the software industry.",
        ],
        "sources": [
            LEADERS_PAGE,
            "https://www.zenoti.com/press/neal-singh-industry-veteran-from-microsoft-ge-and-icertis-joins-zenoti-as-president-coo",
        ],
        "last_checked": LEADERS_CHECKED,
        "photo": "",
        "photo_credit": "",
    },
    {
        "name": "Dheeraj Koneru",
        "title": "Founder & SVP, Global Product Sales",
        "bio": [
            "Co-founded Zenoti and has led its expansion into new regions and new areas such as fitness and gym management.",
            "Before Zenoti he managed Latitudes Health Club and Tangerine Spas.",
            "He co-founded Intelliprep Technologies, which later merged with Click2Learn.",
            "He held leadership roles at SumTotal Systems and Microsoft.",
            "He holds a Ph.D. in Particle Physics from Cornell University.",
        ],
        "sources": [LEADERS_PAGE],
        "last_checked": LEADERS_CHECKED,
        "photo": "",
        "photo_credit": "",
    },
    {
        "name": "Anand Arvind",
        "title": "Founder & Chief Product Officer",
        "bio": [
            "Co-founded Zenoti and, as Chief Product Officer, leads its technology vision.",
            "Has over 20 years of experience in enterprise software.",
            "Was Vice President of Products at SumTotal Systems, where he led a platform used by over 20 million users.",
            "Contributed to Windows System Restore at Microsoft.",
            "Holds degrees from BITS Pilani and Ohio State University, and an MBA from the Indian School of Business.",
        ],
        "sources": [LEADERS_PAGE],
        "last_checked": LEADERS_CHECKED,
        "photo": "",
        "photo_credit": "",
    },
    {
        "name": "Sunil Koneru",
        "title": "Senior VP, Customer Experience",
        "bio": [
            "Leads professional services and customer experience at Zenoti.",
            "Has been at Zenoti for more than 11 years, according to the company's page.",
            "Earlier he held engineering leadership roles in Microsoft's Xbox and Interactive Entertainment division.",
            "Holds a Master's degree in computer engineering from the University of South Carolina.",
        ],
        "sources": [LEADERS_PAGE],
        "last_checked": LEADERS_CHECKED,
        "photo": "",
        "photo_credit": "",
    },
]


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
    "leadership": LEADERS,
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
        "screens and data that role needs. It is an independent portfolio project for one shop: "
        "payments and text messages are simulated, and the limits are written down on this page."
    ),
    "start_here": [
        "Read A day at Alankar for the whole visit as a short story, or press play for a 90-second tour.",
        "Read The project for the four roles, the booking lifecycle and the tech stack.",
        "Read How it maps to Zenoti for what is built, and what is simplified or left out.",
        "Read Quality evidence and Security and privacy for how it was built and checked.",
        "Read Limitations for the honest answers.",
    ],
    "demo_url": "",
    "github_url": "",
    "resume_pdf_url": "",
}

PROJECT = {
    "intro": (
        "A guest browses the public site, signs in to book, and sends a booking request. The "
        "front desk and the chosen stylist must both accept it before anything is confirmed, and "
        "then a payment link follows. After payment the visit is scheduled; the guest checks in, "
        "the stylist runs the service, and the desk bills it. The customer then rates the "
        "stylist, and the admin reviews payroll, reports and staff performance. AIR, an optional "
        "virtual receptionist that is off by default, can cover the front desk when no "
        "receptionist is on shift or signed in; the stylist still has to accept every request."
    ),
    "roles": [
        {
            "role": "Customer",
            "does": [
                "Browses services and prices, sends a booking request in four short steps, pays the emailed link.",
                "Taps I'm here, reschedules or cancels, chats and shares photos with the assigned stylist.",
                "Sees own invoices, packages and orders; must rate the stylist after a visit.",
            ],
        },
        {
            "role": "Receptionist",
            "does": [
                "Accepts request cards (picks the stylist for an any-stylist request, and a room); moves or cancels with a sorry note; checks guests in.",
                "Bills in the point of sale, takes cash, closes the day's cash.",
                "Views stock and own hours and pay. No chat access.",
            ],
        },
        {
            "role": "Stylist",
            "does": [
                "Accepts or declines requests in an inbox; sees own scheduled visits; starts and completes the service.",
                "Chats with own customers; sees ratings anonymously and own earnings.",
                "Cannot see customer phone numbers.",
            ],
        },
        {
            "role": "Admin",
            "does": [
                "Manages staff, services, stock, marketing, content and settings.",
                "Runs payroll (draft, adjust, approve, mark paid) and approves refunds.",
                "Reads shop statistics, reports, staff summaries and the audit log. No access to chats.",
            ],
        },
        {
            "role": "AIR (optional virtual receptionist)",
            "does": [
                "Off by default. Covers the front desk only when no receptionist is on shift or signed in.",
                "Helps customers in the chat: free times, a request the customer sends with a button, own orders; accepts only the desk side, never the stylist's.",
                "Has no login. Every action is in an append-only log the desk and the admin can read and partly undo.",
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
                "Recharts",
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

# Each row's third column is built from the Limitations items named in "limits", so the two never
# disagree. "not_built" is used only by a row that has no limitation behind it.
MAPPING = [
    {
        "workflow": "Online booking requests",
        "built": (
            "Public site with services, options and prices; sign in to book; a request that the "
            "desk and the stylist must both accept, a hold on the stylist's slot, a payment link "
            "and a hold that expires."
        ),
        "limits": ["single-shop", "payments"],
        "not_built": "",
    },
    {
        "workflow": "Scheduling and the calendar",
        "built": (
            "Day schedule by stylist and room, overlap-safe booking, three nearest free times on "
            "a clash, and a waitlist that offers freed slots."
        ),
        "limits": ["single-shop"],
        "not_built": "",
    },
    {
        "workflow": "Guest check-in and service",
        "built": (
            "Customer I'm here flag, desk check-in on the day of the visit, and the stylist "
            "starting and completing own visits only."
        ),
        "limits": [],
        "not_built": "No self check-in kiosk or tablet.",
    },
    {
        "workflow": "Point of sale and billing",
        "built": (
            "Invoices with GST, tips, capped discounts, retail items, loyalty points, cash close "
            "and admin-approved refunds. Paid invoices cannot be edited."
        ),
        "limits": ["payments", "accounting"],
        "not_built": "",
    },
    {
        "workflow": "Inventory",
        "built": "A stock ledger of every movement, purchasing, and retail products on bills.",
        "limits": ["single-shop"],
        "not_built": "",
    },
    {
        "workflow": "Packages, memberships, gift cards and coupons",
        "built": "Packages and memberships with cancel and renew rules, gift cards, credits and coupons.",
        "limits": ["payments"],
        "not_built": "",
    },
    {
        "workflow": "Marketing and messages",
        "built": "Campaigns, coupons and an unsubscribe link, with a developer mailbox to read them.",
        "limits": ["messages"],
        "not_built": "",
    },
    {
        "workflow": "Staff pay, hours and ratings",
        "built": (
            "Pay from per-service task rates and a rating multiplier plus tips, receptionist "
            "hours, payroll runs, performance reviews and staff summary graphs."
        ),
        "limits": ["accounting"],
        "not_built": "",
    },
    {
        "workflow": "Reports and insights",
        "built": (
            "Admin shop statistics with charts and CSV export, reports, staff summaries, and "
            "Chatbot insights showing what customers asked that the bot could not answer."
        ),
        "limits": ["chatbot", "load"],
        "not_built": "",
    },
    {
        "workflow": "Customer assistant",
        "built": "A rule-based chatbot that answers only from the shop's own data and the signed-in user's own records.",
        "limits": ["chatbot"],
        "not_built": "",
    },
    {
        "workflow": "Virtual receptionist (AIR)",
        "built": (
            "An optional, off-by-default receptionist that covers the desk only when nobody is on "
            "shift or signed in: chat booking requests the customer sends with a button, product "
            "orders, an activity page with charts and a needs-you list, and a spoken summary for "
            "the receptionist in the browser."
        ),
        "limits": ["air", "payments", "messages"],
        "not_built": "",
    },
    {
        "workflow": "Personal recommendations",
        "built": (
            "Suggestions on the customer dashboard with a plain reason each (booked together, "
            "similar to a past visit, chosen interests, most booked, well rated), rebook reminders "
            "with real free times, an add-on only when the same stylist is free right after, "
            "aftercare products, quieter times, chat answers, and an admin page with shown, "
            "clicked and booked counts and a time-split evaluation against a popularity baseline. "
            "Counting rules only, from booking history; never gender, age, caste or religion. On "
            "by default with a one-time notice and a switch for the customer."
        ),
        "limits": ["demo-data", "single-shop"],
        "not_built": "",
    },
    {
        "workflow": "Personal emails",
        "built": (
            "Campaign emails built on those recommendations (for you, products, time to rebook, "
            "most booked, highest rated with at least five ratings, real offers only), with an "
            "unticked consent box, recorded consent versions, one-click unsubscribe, preview, a "
            "test send, approve and send, quiet hours, one email a week per customer, batches, "
            "and clicks and bookings counted without tracking pixels."
        ),
        "limits": ["messages", "demo-data"],
        "not_built": "",
    },
    {
        "workflow": "Roles, security and audit",
        "built": "Four roles with strict isolation, encryption of sensitive fields, and an audit log.",
        "limits": ["single-shop", "sign-in", "encryption"],
        "not_built": "",
    },
    {
        "workflow": "Mobile experience",
        "built": "A responsive website with a guided booking flow and a phone menu, checked at phone width.",
        "limits": ["no-apps", "browsers"],
        "not_built": "",
    },
]

STORY = {
    "intro": (
        "One visit, from the first tap to the owner's dashboard. The four people below are made "
        "up, to show how the product behaves. Read it as seven short chapters, or press play and "
        "it runs by itself in about 90 seconds."
    ),
    "note": "Priya, Rahul, Meera and Suresh are fictional characters. They are not real customers or staff.",
    "characters": [
        {"name": "Priya", "role": "Customer", "line": "Needs a haircut for her cousin's wedding."},
        {
            "name": "Rahul",
            "role": "Receptionist",
            "line": "Runs the front desk and knows which room is free.",
        },
        {
            "name": "Meera",
            "role": "Stylist",
            "line": "Cuts hair, and answers requests between clients.",
        },
        {
            "name": "Suresh",
            "role": "Owner and admin",
            "line": "Reads the numbers and approves the payroll.",
        },
    ],
    "chapters": [
        {
            "visual": "request",
            "title": "Priya asks for a slot",
            "body": (
                "Priya's cousin is getting married on Saturday week. On her phone she opens the "
                "Alankar site, picks a haircut, then a day, a time and Meera as her stylist. The "
                "form asks one thing at a time: Service, Time, Details, Review. She reads the "
                "cancellation policy, ticks the box and sends a request. It is a request, not a "
                "booking yet, and the page says so."
            ),
            "behind": (
                "A request holds Meera's slot while the shop decides, so nobody else can take it. "
                "The form is four steps so a phone user answers one question at a time, and each "
                "step is checked before moving on."
            ),
            "where": ["frontend/src/pages/customer/BookPage.tsx", "backend/scheduling/booking.py"],
        },
        {
            "visual": "approval",
            "title": "Two people say yes",
            "body": (
                "The request lands in two places. Rahul sees a card at the front desk; Meera sees "
                "it in her Requests inbox. Meera is free and taps Accept. Rahul checks the room, "
                "picks one and taps Accept. Only when both have said yes does Priya's booking "
                "move on to Ready to pay. Until then, she sees Waiting for approval."
            ),
            "behind": (
                "Two flags, one for the front desk and one for the stylist. Each accept re-checks "
                "the slot under a database lock. Rahul can hand a request to another stylist, but "
                "he can never accept on Meera's behalf."
            ),
            "where": [
                "backend/scheduling/approvals.py",
                "backend/scheduling/tests/test_dual_approval.py",
            ],
        },
        {
            "visual": "twist",
            "title": "The week Meera could not",
            "body": (
                "Another week, Meera has a family function and taps Decline, adding a reason only "
                "she and Rahul can read. Priya gets a kind note saying Meera cannot make that "
                "time, and one button: Choose another time or stylist. It opens the booking form "
                "with her service, options and the old time already filled in. Meera's held slot "
                "is released at once, and nobody is double-booked."
            ),
            "behind": (
                "A decline ends that request for good. A slot that is already taken cannot be "
                "booked again: the server answers 409 with the three nearest free times, and two "
                "desks acting at the same moment are tested. If nobody answers, the request "
                "expires after the approval window (24 hours unless the admin changes it)."
            ),
            "where": [
                "backend/scheduling/approvals.py",
                "backend/billing/tests/test_concurrency_8b.py",
                "frontend/src/pages/customer/AppointmentsPage.tsx",
            ],
        },
        {
            "visual": "pay",
            "title": "Paying, and a picture for Meera",
            "body": (
                "With both yeses in, Priya gets a payment link. She pays through a simulated "
                "gateway: nothing is charged, and the site says so. The booking is now scheduled "
                "and a private Zen Chat opens between Priya and Meera. Priya sends a photo of the "
                "style she likes, tagged Style reference, with a short caption."
            ),
            "behind": (
                "Every picture is re-encoded on upload, so camera and location data are gone, "
                "and it is stored encrypted. Only the two people in the conversation can open it, "
                "and the sender can delete it. The receptionist and the admin have no chat screen."
            ),
            "where": [
                "backend/chat/images.py",
                "backend/billing/tender.py",
                "backend/core/crypto.py",
            ],
        },
        {
            "visual": "visit",
            "title": "The visit, and an invoice that stays",
            "body": (
                "On the day Priya taps I'm here. Rahul checks her in, Meera starts the service "
                "and marks it done. At the desk Rahul bills it: GST, a tip for Meera, maybe a "
                "bottle of shampoo. An invoice number appears, and from that moment no one can "
                "edit the invoice. If something was wrong, the fix is a refund that Suresh must "
                "approve."
            ),
            "behind": (
                "Check-in works only on the day of the visit, billing is one atomic transaction, "
                "and a paid invoice is immutable. Stock moves through a ledger, so the shampoo "
                "leaves a record too."
            ),
            "where": [
                "backend/billing/checkout.py",
                "backend/billing/refunds.py",
                "backend/inventory/models.py",
            ],
        },
        {
            "visual": "rating",
            "title": "A rating nobody can change",
            "body": (
                "Priya cannot book again until she has rated Meera, so she gives five stars. "
                "Nobody can change that rating, not Meera, Rahul or Suresh. Suresh can mark one "
                "under review or leave it out, but only with a written reason that goes into the "
                "audit log. Meera's pay uses the average of her ratings for the month: from 4.5 "
                "stars her per-service pay is multiplied by 1.20, once she has at least five "
                "rated visits. Her tips are hers in full."
            ),
            "behind": (
                "A rating is saved once and is immutable. The bands and the minimum number of "
                "ratings are admin settings; the defaults are the ones named here."
            ),
            "where": [
                "backend/people/ratings.py",
                "backend/people/pay.py",
                "backend/people/rating_admin.py",
            ],
        },
        {
            "visual": "dashboard",
            "title": "Suresh opens his dashboard",
            "body": (
                "At the end of the month Suresh opens one screen: revenue split into services, "
                "products, tips, packages and memberships, bookings by status, the busiest hours "
                "and the top stylists, each chart with a table behind it. Then he runs payroll: "
                "a draft, his adjustments, approval, and marked paid. Every step, and every "
                "sign-in and refund along the way, is in the audit log."
            ),
            "behind": (
                "One service computes every number on the dashboard, and the revenue reconciles "
                "with the older reports. Payroll moves draft, approved, paid; payments are marked "
                "by hand because no money moves."
            ),
            "where": [
                "backend/billing/shopstats.py",
                "backend/people/payroll.py",
                "backend/accounts/audit.py",
            ],
        },
    ],
}

QUALITY = {
    "intro": (
        "Evidence you can check, not adjectives. Counts of tests come from a script that counts "
        "the repository; accuracy comes from running the test that measures it, and a test fails "
        "if the numbers on this page stop matching."
    ),
    "accuracy": [
        {
            "name": "Chatbot: questions it was tuned on",
            "hits": 130,
            "total": 143,
            "measured_on": MEASURED,
            "how": "A question counts as right when the engine picks the expected answer (follow-up questions included). Run: pytest chatbot/tests/test_accuracy.py.",
            "caveat": "I wrote these questions while building the bot, so this number is optimistic.",
            "where": [
                "backend/chatbot/tests/test_accuracy.py",
                "backend/chatbot/tests/eval_sets.py",
            ],
        },
        {
            "name": "Chatbot: holdout questions it was not tuned on",
            "hits": 67,
            "total": 91,
            "measured_on": MEASURED,
            "how": "Same test, a second set kept apart from the tuning. The two sets are checked not to overlap.",
            "caveat": "Also written by me, not by real customers. Real accuracy will be lower; the Chatbot insights screen lists what real visitors ask that it could not answer.",
            "where": [
                "backend/chatbot/tests/test_accuracy.py",
                "backend/chatbot/tests/eval_sets.py",
            ],
        },
    ],
    "checks": [
        {
            "title": "Every role, every endpoint",
            "detail": "A sweep signs in as a guest and as each role and calls every endpoint, comparing the answer with the policy file. Separate tests check what each role's JSON contains, and that every state-changing call refuses a missing CSRF header.",
            "where": ["backend/core/tests/test_sweep.py", "backend/core/tests/test_csrf_sweep.py"],
        },
        {
            "title": "Two people at once",
            "detail": "Tests run double checkout, double refund approval, the last unit of stock, overlapping confirmations and a double payment at the same moment and expect exactly one to win. The dual approval has its own tests.",
            "where": [
                "backend/billing/tests/test_concurrency_8b.py",
                "backend/scheduling/tests/test_dual_approval.py",
            ],
        },
        {
            "title": "Query counts and database rules",
            "detail": "Tests fix how many database queries the main lists may run, so they cannot grow per row. The database refuses impossible rows (negative prices, a visit that ends before it starts), and a read-only integrity command reports anything that slipped through.",
            "where": [
                "backend/core/tests/test_query_counts.py",
                "backend/core/tests/test_db_constraints.py",
                "backend/core/integrity.py",
            ],
        },
        {
            "title": "Real browsers",
            "detail": "Playwright drives Chromium through the whole workflow with four signed-in roles, checks phone width, and runs an axe-core scan for WCAG 2.1 A and AA violations on every listed screen; a serious or critical violation fails the run.",
            "where": [
                "frontend/e2e/full-workflow.e2e.ts",
                "frontend/e2e/axe.e2e.ts",
                "frontend/e2e/mobile.e2e.ts",
            ],
        },
        {
            "title": "Dependency audits",
            "detail": "pip-audit and npm audit were run on 2026-10-28 and 2026-10-29. Django and Django REST framework were upgraded to fixed versions; the findings that are still open are listed under Limitations.",
            "where": ["docs/SECURITY.md", "scripts/audit.sh"],
        },
    ],
    "verify_note": "The browser tests and the axe scan run on a developer machine, not in a hosted build pipeline. Run npm run e2e in the frontend folder for the current result.",
}

SECURITY = {
    "intro": (
        "What protects the system and the people in it, each with the file it lives in. What "
        "testing found and fixed is listed too. What is not covered is under Limitations."
    ),
    "items": [
        {
            "title": "Role isolation",
            "body": (
                "One policy file decides every role's menus, pages and API actions, and anything "
                "not listed is denied. Every query is scoped to the caller: a customer reaches "
                "only their own records, a stylist only their own work. Public ids are UUIDs, "
                "forbidden buttons are removed rather than greyed out, and a stylist never sees a "
                "customer's phone number."
            ),
            "where": [
                "shared/policy.json",
                "backend/core/policy.py",
                "backend/core/permissions.py",
            ],
        },
        {
            "title": "Sign-in and sessions",
            "body": (
                "Passwords are hashed with Argon2. Five wrong passwords for one email lock it for "
                "15 minutes. A session is a 15-minute access token plus a refresh token that "
                "rotates on every use, both in httpOnly cookies; nothing is kept in local storage. "
                "Changing a password ends every other session at once. The admin can switch on an "
                "authenticator-app code."
            ),
            "where": [
                "backend/accounts/lockout.py",
                "backend/accounts/tokens.py",
                "backend/accounts/twofactor.py",
            ],
        },
        {
            "title": "Email codes and remembered devices",
            "body": (
                "Customers confirm their email with a 6-digit code when they sign in. Ticking "
                "Remember this device skips that code for 30 days on one browser, and only that: "
                "the password is still checked. The token rotates, a replayed one cancels the "
                "device, and a password change or a lockout cancels them all. Changing the "
                "password, deleting the account or exporting data asks for a fresh code."
            ),
            "where": [
                "backend/accounts/otp.py",
                "backend/accounts/trusted.py",
                "backend/accounts/stepup.py",
            ],
        },
        {
            "title": "Encryption",
            "body": (
                "Contact phone, allergies, notes and chat messages are encrypted in the database "
                "with AES-256-GCM, each value tied to its column. Phone search uses a keyed hash. "
                "Chat uses a key derived for each conversation. The master key lives only in the "
                "server's settings file and is never committed."
            ),
            "where": ["backend/core/crypto.py", "backend/core/fields.py", ".env.example"],
        },
        {
            "title": "Private chat and photos",
            "body": (
                "Only the customer and their assigned stylist can read a conversation; the "
                "receptionist and the admin have no chat screen. A photo is checked by its real "
                "type, limited to 5 MB, re-encoded so camera and location data are gone, stored "
                "encrypted, and sent to the browser with no-store headers. The sender can delete "
                "it."
            ),
            "where": [
                "backend/chat/images.py",
                "backend/chat/views.py",
                "frontend/e2e/z-chat-photos.e2e.ts",
            ],
        },
        {
            "title": "The audit log",
            "body": (
                "Sign-ins, lockouts, role and price changes, refunds, invites, exports, rating "
                "exclusions, payroll steps and content publishing are written to an audit log "
                "that admins can read and that the clean-up job never removes."
            ),
            "where": ["backend/accounts/audit.py", "backend/accounts/models.py"],
        },
        {
            "title": "Browser and server protections",
            "body": (
                "API responses carry a strict content security policy, no-store caching and "
                "nosniff headers; the API accepts JSON (and the photo upload) only. Rate limits "
                "apply to sign-in, booking and chat. Logs are scrubbed of tokens, passwords and "
                "card-like numbers. The React app never injects raw HTML."
            ),
            "where": [
                "backend/core/middleware.py",
                "backend/core/throttles.py",
                "backend/core/logging_filters.py",
            ],
        },
        {
            "title": "Privacy rights and retention",
            "body": (
                "A customer can download their data or ask to be anonymized, which removes name, "
                "contact details, notes, chat messages and consents but keeps invoice amounts. "
                "Old one-time tokens, sign-in attempts and chat photos are cleaned up on a "
                "schedule; the exact periods are under Limitations."
            ),
            "where": [
                "backend/people/privacy.py",
                "backend/core/jobs.py",
                "backend/chat/images.py",
            ],
        },
        {
            "title": "What testing found",
            "body": (
                "Task 8 found and fixed seven problems, among them a forged forwarding header that "
                "dodged every rate limit, a staff invite that stayed valid after the person was "
                "deactivated, a banner link that could carry javascript:, reset links that two "
                "simultaneous clicks could both use, and access tokens that survived a password "
                "change for up to 15 minutes. Each has a test."
            ),
            "where": [
                "docs/SECURITY.md",
                "backend/accounts/tests/test_hardening.py",
                "backend/core/tests/test_security_headers.py",
            ],
        },
    ],
}

LIMITATIONS = {
    "intro": (
        "A project is easier to trust when it says what it does not do. Each item below was "
        "checked against the code before it was written. The left side is what the project does "
        "today; the right side is what is out of scope, which is a boundary and not a promise."
    ),
    "items": [
        {
            "id": "single-shop",
            "area": "One shop only",
            "today": "One business per installation. Every booking, price, stylist, room and report belongs to that one shop; the database has no branch, franchise or location model.",
            "out_of_scope": "Several branches or a franchise group, reports across branches, and moving stock between stores.",
            "where": ["backend/core/brand.py", "docs/MASTER_NOTES.md"],
        },
        {
            "id": "payments",
            "area": "Payments",
            "today": "Every online payment (a booking, a package, a membership, a gift card) goes through one simulated gateway that approves or declines and returns a MOCK reference. Nothing is charged. At the desk, cash, card and UPI are recorded by the receptionist once the money has changed hands. Refunds are approved by the admin and recorded.",
            "out_of_scope": "A real payment gateway, a card terminal, bank settlement, chargebacks, and refunds that send money back to a card.",
            "where": ["backend/billing/tender.py", "backend/billing/refunds.py"],
        },
        {
            "id": "messages",
            "area": "Email, text messages and notifications",
            "today": "Every email is saved in an outbox first and is sent by SMTP only if an email server is set in the settings; with none set, nothing leaves the machine and the developer mailbox shows the message. Text messages are written to a table and never sent. The in-app notification bell works in full. There is no WhatsApp code.",
            "out_of_scope": "Delivering real text or WhatsApp messages, delivery receipts, and push notifications.",
            "where": [
                "backend/core/mail.py",
                "backend/notifications/service.py",
                "backend/notifications/models.py",
            ],
        },
        {
            "id": "no-apps",
            "area": "Apps and offline use",
            "today": "A responsive website. Layouts were checked at 375, 768 and 1280 pixels, and the phone-width tests run at 375 pixels.",
            "out_of_scope": "Native iOS and Android apps, installing the site as an app, working offline, and push notifications.",
            "where": ["frontend/e2e/mobile.e2e.ts"],
        },
        {
            "id": "accounting",
            "area": "Accounting, tax and payroll deductions",
            "today": "Prices include GST: 18% by default, with a different rate settable per service or product, and invoices show the GST part. Shop statistics and reports can be exported as CSV, and each export is audited. Payroll is a draft, an approval and a paid mark, done by hand.",
            "out_of_scope": "Accounting-software integration, GSTIN and e-invoicing, filing returns, and statutory payroll deductions (PF, ESI, TDS). No money is paid out by the app.",
            "where": [
                "backend/billing/pos.py",
                "backend/billing/shopstats.py",
                "backend/people/payroll.py",
            ],
        },
        {
            "id": "demo-data",
            "area": "Demo data only",
            "today": "Everything you see is fictional. A command builds 49 days of history through the real booking, billing, rating and payroll code, and every demo address is on example.com.",
            "out_of_scope": "Importing a real shop's records, onboarding, and moving over from other software.",
            "where": ["backend/core/demo.py", "backend/core/demo_story.py"],
        },
        {
            "id": "load",
            "area": "Load and scale",
            "today": "I have not run a load or stress test, so I make no claim about how many people it can serve. What I did measure: tests fix the number of database queries behind the main lists, and two desks acting at the same moment are tested. On the demo database the shop-statistics page took 61 queries and 0.1 to 0.3 seconds in one run in the build environment.",
            "out_of_scope": "Proven capacity, and more than one server process: rate limits and live chat keep their state in the memory of one process, and Redis is not set up.",
            "where": [
                "backend/core/tests/test_query_counts.py",
                "backend/billing/tests/test_concurrency_8b.py",
                "docs/SECURITY.md",
            ],
        },
        {
            "id": "chatbot",
            "area": "The chatbot and the admin side",
            "today": "The chatbot's own engine is a rule program (text matching, a rule table and a search formula). It answers from the shop's own data and, for a signed-in customer, their own bookings, invoices and points. Measured on questions I wrote myself: 130 of 143 (90.9%) on the set it was tuned on and 67 of 91 (73.6%) on a holdout set, measured on 5 November 2026. In the same chat window, AIR (below) can prepare booking requests and orders.",
            "out_of_scope": "Open conversation and unusual phrasing (the holdout misses include 'what time do you shut' and 'which area are you in'), and accuracy on real customers' questions, which I have not measured. The admin assistant, \"Alankar Intelligence\", is planned future work and is not built: the admin side has shop statistics, the AIR Activity page and a list of questions the bot could not answer.",
            "where": [
                "backend/chatbot/engine/",
                "backend/chatbot/tests/test_accuracy.py",
                "docs/CHATBOT_ALGORITHM.md",
            ],
        },
        {
            "id": "air",
            "area": "AIR, the virtual receptionist",
            "today": "Built, optional and off by default. When the admin switches it on, AIR covers the front desk only while no receptionist is on shift or signed in, and hands everything back when one signs in. It can accept the desk side of a request, never the stylist's; a booking is confirmed only after payment, and payments are simulated. Without any key it understands messages with rules: on booking and order messages I wrote myself, 54 of 55 (98.2%) on the set it was tuned on and 41 of 45 (91.1%) on a holdout set, measured on 8 November 2026. An optional AI service (a third-party language-model provider, used only with the admin's key, a spending cap and the customer's consent) can help it read messages; the rules take over when it fails.",
            "out_of_scope": "Real phone calls: AIR works in the chat, and the receptionist's popup reads its summary aloud with the browser's own voice only. Real payments and text messages (both simulated). The accuracy of the optional AI service, which I have not measured, and anything a third-party provider does with the text it receives.",
            "where": [
                "backend/air/",
                "backend/air/tests/test_eval.py",
                "docs/AIR.md",
            ],
        },
        {
            "id": "sign-in",
            "area": "Sign-in, codes and remembered devices",
            "today": "Customers confirm their email with a 6-digit code on sign-in, but only when a code can be delivered (an email server, or the developer mailbox in debug mode). Remember this device skips that code for 30 days and nothing else. Staff sign in with a password; only the admin can add an authenticator-app code.",
            "out_of_scope": "A second step for receptionists and stylists, passkeys and hardware keys, and spotting a stolen browser before its remembered device is revoked or expires. The email code is only as safe as the customer's mailbox. Anyone can lock another person's account for 15 minutes by typing wrong passwords for that email.",
            "where": [
                "backend/accounts/otp.py",
                "backend/accounts/trusted.py",
                "backend/accounts/lockout.py",
                "docs/SECURITY.md",
            ],
        },
        {
            "id": "encryption",
            "area": "Encryption",
            "today": "Contact phone, allergies, notes and chat messages and photos are encrypted in the database with AES-256-GCM. The key is kept in the server's settings file.",
            "out_of_scope": "End-to-end encryption. The server holds the key, so whoever has the key and the database can read these fields. The admin has no chat screen, but that is a rule of the application, not a technical barrier.",
            "where": ["backend/core/crypto.py", "backend/core/fields.py"],
        },
        {
            "id": "retention",
            "area": "Data retention",
            "today": "The clean-up command removes one-time tokens after 7 days and sign-in attempts after 90 days. Chat photos are wiped 30 days (the admin can set 1 to 365) after a conversation closes, or at once when the sender deletes one. A customer can download their data or ask to be anonymized, which keeps invoice amounts. Audit logs are never removed.",
            "out_of_scope": "Automatic deletion of chat text, bookings, invoices or inactive customers, and a retention schedule for any country's law. I am not a lawyer and nothing here is legal advice.",
            "where": [
                "backend/core/jobs.py",
                "backend/chat/images.py",
                "backend/people/privacy.py",
            ],
        },
        {
            "id": "browsers",
            "area": "Browsers, devices and accessibility testing",
            "today": "The automated browser tests run in Chromium at 1280 by 900 pixels, with phone-width checks at 375 pixels, and axe-core scans every listed screen for WCAG 2.1 A and AA violations.",
            "out_of_scope": "Firefox, Safari, real phones and tablets, and testing with real screen readers. An automated scan finds only part of the accessibility problems a person would.",
            "where": ["frontend/playwright.config.ts", "frontend/e2e/axe.e2e.ts"],
        },
        {
            "id": "hosting",
            "area": "Hosting and operations",
            "today": "It runs on a developer machine with PostgreSQL. There are commands for timed jobs (to be scheduled every five minutes), backup, restore into a new database, an integrity check and a production-settings check.",
            "out_of_scope": "A live deployment, HTTPS, a backup schedule, monitoring and alerts. None of these is set up.",
            "where": ["docs/OPERATIONS.md", "backend/core/deploycheck.py"],
        },
        {
            "id": "dependencies",
            "area": "Known dependency advisories",
            "today": "The audits of 28 and 29 October 2026 led to Django and Django REST framework being upgraded to fixed versions.",
            "out_of_scope": "Still open at that date: Twisted (through Daphne) has advisories with no stable fix yet, and react-router, zod and the dev tools vite and vitest have advisories whose fix is a breaking major upgrade. Re-run the audit before any real use.",
            "where": ["docs/SECURITY.md", "scripts/audit.sh"],
        },
        {
            "id": "language",
            "area": "Language and region",
            "today": "English, Indian rupees, GST and the Asia/Kolkata time zone. The chatbot also recognizes some Hindi and Telugu words written in English letters.",
            "out_of_scope": "Other languages, currencies, tax systems and time zones.",
            "where": ["backend/config/settings.py"],
        },
    ],
}

DEMO = {"logins": [], "guide": []}

SEED = {
    "overview": OVERVIEW,
    "resume": RESUME,
    "zenoti": ZENOTI,
    "project": PROJECT,
    "mapping": MAPPING,
    "story": STORY,
    "quality": QUALITY,
    "security": SECURITY,
    "limitations": LIMITATIONS,
    "demo": DEMO,
}
