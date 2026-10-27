import type { BookingOptions, CustomerAppointment } from '../api/booking';
import type { DeskAppointment } from '../api/desk';
import { haircut } from './fixtures';

export const options: BookingOptions = {
  service: haircut,
  stylists: [{ id: 'st1', display_name: 'Rahul', title: 'Senior stylist', photo_url: '' }],
  days: ['2026-10-28', '2026-10-29'],
  rules: { deposit_percent: 100, free_cancel_hours: 24, hold_hours: 6, gst_percent: 18 },
  contact: {
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '9876543210',
    allergies: '',
  },
  pending_ratings: 0,
};

export const SLOT_A = '2026-10-28T10:00:00+05:30';
export const SLOT_B = '2026-10-28T10:15:00+05:30';

export const slotResult = {
  date: '2026-10-28',
  duration_minutes: 45,
  price_total: '500.00',
  gst_amount: '76.27',
  amount_payable: '500.00',
  slots: [SLOT_A, SLOT_B],
};

export const appointment: CustomerAppointment = {
  id: 'ap1',
  status: 'requested',
  status_label: 'Requested',
  service_name: "Women's Haircut",
  service_slug: 'womens-haircut',
  division: 'salon',
  variant_label: 'Short hair',
  addon_labels: [],
  duration_minutes: 45,
  price_total: '500.00',
  gst_amount: '76.27',
  amount_payable: '500.00',
  preferred_start: SLOT_A,
  preferred_stylist_name: null,
  stylist_name: null,
  room_name: null,
  start: null,
  end: null,
  awaiting_payment_until: null,
  arrived_at: null,
  reschedule_requested: false,
  reschedule_preferred: null,
  cancel_requested: false,
  reject_reason: '',
  created_at: '2026-10-27T08:00:00Z',
  notes: '',
  allergies: '',
  actions: ['cancel'],
  free_cancel_until: null,
  amount_paid: '0.00',
  chat_thread_id: null,
};

export const awaiting: CustomerAppointment = {
  ...appointment,
  id: 'ap2',
  status: 'awaiting_payment',
  status_label: 'Awaiting payment',
  stylist_name: 'Rahul',
  start: SLOT_A,
  end: '2026-10-28T10:45:00+05:30',
  awaiting_payment_until: '2026-10-27T14:00:00Z',
  actions: ['cancel', 'pay', 'resend_link', 'reschedule'],
};

export const deskRequest: DeskAppointment = {
  id: 'ap1',
  status: 'requested',
  status_label: 'Requested',
  service_name: "Women's Haircut",
  division: 'salon',
  variant_label: 'Short hair',
  addon_labels: [],
  duration_minutes: 45,
  price_total: '500.00',
  amount_payable: '500.00',
  preferred_start: SLOT_A,
  preferred_stylist_name: 'Rahul',
  preferred_stylist_id: 'st1',
  stylist_name: null,
  stylist_id: null,
  room_name: null,
  room_id: null,
  start: null,
  end: null,
  awaiting_payment_until: null,
  arrived_at: null,
  reschedule_requested: false,
  reschedule_preferred: null,
  reschedule_note: '',
  cancel_requested: false,
  cancel_reason: '',
  reject_reason: '',
  customer_name: 'Test Customer',
  customer_email: 'customer@example.com',
  customer_phone: '9876543210',
  notes: '',
  allergies: 'Latex',
  source: 'online',
  created_at: '2026-10-27T08:00:00Z',
  events: [],
  actions: ['confirm', 'reject'],
};

export const scheduledVisit: DeskAppointment = {
  ...deskRequest,
  id: 'ap2',
  status: 'scheduled',
  status_label: 'Scheduled',
  stylist_name: 'Rahul',
  stylist_id: 'st1',
  room_name: 'Salon chair 1',
  room_id: 'r1',
  start: SLOT_A,
  end: '2026-10-28T10:45:00+05:30',
  actions: ['move', 'cancel'],
};
