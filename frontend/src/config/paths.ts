/**
 * Booking needs a logged-in customer. Until a service is picked, "Book Now" sends a
 * guest to the customer sign-in tab; after sign-in (Task 1/2) they continue to booking.
 */
export const BOOK_NOW_PATH = '/login?role=customer&intent=book';
