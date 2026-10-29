"""Built-in answers of AI Alankar Intelligence. The admin's FAQ entries (website.KnowledgeEntry) are
added to these; an FAQ entry tagged `kb:<id>` replaces the built-in answer with that id.
Placeholders: {shop_name} {hours} {address} {phone} {email} {cancel_window_hours} {link_valid_hours}
"""

BUILTIN_KB = [
    {
        "id": "what_is_alankar",
        "question": "What is Alankar? Tell me about the shop",
        "tags": ["about", "shop", "alankar", "salon", "spa", "parlor", "unisex"],
        "answer": "{shop_name} is a unisex salon, spa and beauty parlor. Choose Salon for hair, Spa for massage and wellness, or Beauty Parlor for skin care, makeup, bridal and nails.",
    },
    {
        "id": "how_to_book",
        "question": "How do I book an appointment?",
        "tags": ["book", "appointment", "steps", "how"],
        "answer": "1) Open Salon, Spa or Beauty Parlor and pick a service. 2) Log in or register. 3) Choose your preferred date, time and stylist. 4) Send the booking request. 5) When the salon confirms, you receive a payment link by email. 6) Pay online and your appointment is confirmed.",
    },
    {
        "id": "payment_howto",
        "question": "How do I pay for my appointment?",
        "tags": ["pay", "payment", "online", "upi", "card"],
        "answer": "After the salon confirms your request you receive a payment link by email. Open it and pay online. Your appointment is scheduled as soon as the payment succeeds. Anything extra, such as add-ons or a tip, is settled at the salon after your service.",
    },
    {
        "id": "payment_link",
        "question": "I did not get the payment link. Payment link expired.",
        "tags": ["payment", "link", "email", "expired", "resend", "spam"],
        "answer": "The link is sent only after the salon confirms your request. Check your spam folder, or open My Appointments, find the booking marked Awaiting payment and choose Resend link. A link stays valid for {link_valid_hours} hours; after that the slot is released and the salon can send you a new one.",
    },
    {
        "id": "cancellation_policy",
        "question": "What is the cancellation policy? How do I cancel?",
        "tags": ["cancel", "policy", "cancellation", "free", "window"],
        "answer": "You can cancel from My Appointments. Cancelling at least {cancel_window_hours} hours before your appointment is free and refunded automatically. Later cancellations are sent to the salon for review.",
    },
    {
        "id": "refund_policy",
        "question": "How do refunds work?",
        "tags": ["refund", "money", "back"],
        "answer": "Eligible refunds go back to your original payment method. Cancellations made at least {cancel_window_hours} hours ahead are refunded automatically; other cases are reviewed by the salon owner.",
    },
    {
        "id": "reschedule_info",
        "question": "How do I reschedule or change my appointment time?",
        "tags": ["reschedule", "change", "time", "date", "postpone"],
        "answer": "Open My Appointments, choose the booking and tap Request reschedule with your preferred new time. The salon will confirm the change.",
    },
    {
        "id": "rating_info",
        "question": "Why do I have to rate my stylist?",
        "tags": ["rating", "review", "feedback", "mandatory", "stylist"],
        "answer": "After each completed visit you rate your stylist from 1 to 5 stars. It is required before you can send a new booking request, and it helps us recognise great service.",
    },
    {
        "id": "chat_howto",
        "question": "How do I chat with my stylist?",
        "tags": ["chat", "message", "stylist", "talk"],
        "answer": "Once your appointment is confirmed and paid, open Stylist Chat from the menu and tap your stylist's card to start chatting.",
    },
    {
        "id": "login_help",
        "question": "I cannot log in. I forgot my password.",
        "tags": ["login", "password", "forgot", "otp", "account"],
        "answer": "Use Login and pick your role. If you forgot your password, choose Forgot password and follow the link. After 5 wrong attempts an account is locked for 15 minutes.",
    },
    {
        "id": "register_help",
        "question": "How do I create an account? How do I register?",
        "tags": ["register", "signup", "create", "account", "new", "customer"],
        "answer": "Choose Register, enter your name, phone and email, set a password and verify the code. Only customers register online; staff accounts are created by the salon owner.",
    },
    {
        "id": "loyalty_info",
        "question": "How do loyalty points work?",
        "tags": ["loyalty", "points", "reward", "redeem", "earn"],
        "answer": "You earn points on every paid visit. Your balance is in My Wallet and you can redeem points at checkout.",
    },
    {
        "id": "offers",
        "question": "Are there any offers, discounts or coupons?",
        "tags": ["offer", "discount", "coupon", "package", "membership"],
        "answer": "Current offers appear on the home page. Packages, memberships and gift cards are in My Wallet, and you can enter a coupon code in the booking sheet before you send your request.",
    },
    {
        "id": "allergies",
        "question": "I have allergies. How do I tell the stylist?",
        "tags": ["allergy", "allergies", "skin", "sensitive", "notes"],
        "answer": "Add your allergies in your Profile and in the notes of your booking. Your stylist sees an alert before your service. Your health details are stored encrypted.",
    },
    {
        "id": "arrival",
        "question": "What should I do when I arrive?",
        "tags": ["arrive", "arrival", "reach", "late", "checkin", "here"],
        "answer": "Tap I'm here on your appointment card when you arrive. The reception checks you in and your stylist is notified. Please arrive about 10 minutes early.",
    },
    {
        "id": "privacy",
        "question": "Is my data safe?",
        "tags": ["privacy", "data", "safe", "secure", "encrypted"],
        "answer": "Your phone number, allergies, notes and chat messages are stored encrypted. Only the people who need them for your visit can see them.",
    },
    {
        "id": "giftcard",
        "question": "Can I buy or use a gift card?",
        "tags": ["gift", "giftcard", "card", "voucher"],
        "answer": "Buy or redeem gift cards in My Wallet. A gift card balance can be applied at checkout.",
    },
    {
        "id": "hours",
        "question": "What are your opening hours?",
        "tags": ["hours", "open", "close", "timing"],
        "answer": "{shop_name} is open {hours}.",
    },
    {
        "id": "location",
        "question": "Where is the shop located?",
        "tags": ["location", "address", "directions", "map"],
        "answer": "You can find {shop_name} at: {address}.",
    },
    {
        "id": "contact",
        "question": "How can I contact the salon?",
        "tags": ["contact", "phone", "call", "email"],
        "answer": "Call us on {phone} or email {email}.",
    },
    # ---- Task 8.5 ----
    {
        "id": "shop_delivery",
        "question": "Do you deliver products? What is the delivery charge?",
        "tags": ["shop", "delivery", "deliver", "order", "products", "charge", "free"],
        "answer": "Yes. Order hair, skin and spa products from Shop in your account and we deliver them to your address. Delivery costs Rs {delivery_fee}, and it is free for orders of Rs {free_delivery_over} or more. Track every order under My Orders.",
    },
    {
        "id": "order_cancel",
        "question": "How do I cancel a shop order?",
        "tags": ["order", "cancel", "refund", "shop"],
        "answer": "Open My Orders, pick the order and choose Cancel this order. You can cancel while it is waiting for payment or paid but not yet packed, and anything you paid is refunded to the way you paid. Once it is packed, please call the salon.",
    },
    {
        "id": "coupon_howto",
        "question": "How do I use a coupon code?",
        "tags": ["coupon", "code", "promo", "discount", "apply"],
        "answer": "Type the code in the Coupon box when you check out in the Shop, or on the page where you pay for a booking, then choose Apply. One coupon per bill. A membership discount is worked out after the coupon, and a gift card pays last.",
    },
    {
        "id": "products_with_booking",
        "question": "Can I add products to my appointment?",
        "tags": ["products", "appointment", "add", "booking", "visit"],
        "answer": "Yes. The booking sheet suggests products for your service: add them and they are kept for you and paid online with the booking. You can also open Shop and choose Add to my next appointment; those are kept for your visit and paid at the salon.",
    },
    {
        "id": "package_cancel",
        "question": "How do I cancel a package and get a refund?",
        "tags": ["package", "cancel", "refund", "sessions"],
        "answer": "Open Packages, choose Cancel for a refund on the package and tell us why. You see an estimate for the unused sessions; the salon reviews every request and the refund is paid once it is approved.",
    },
    {
        "id": "membership_manage",
        "question": "How do I renew, cancel or buy a membership again?",
        "tags": ["membership", "renew", "cancel", "again", "plan"],
        "answer": "Open Memberships. Renew adds another period (renewing also takes back a cancellation). Cancel keeps your benefits until the end of the period. After a membership ends, pick a plan and choose Buy again.",
    },
]
