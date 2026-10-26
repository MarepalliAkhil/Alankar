import type { Service, SiteData, TeamMember } from '../api/public';

export const site: SiteData = {
  hero: { headline: 'Look good. Feel calm.', subtitle: 'Hair, spa and beauty under one roof.' },
  about: { heading: 'About us', body: 'We are a unisex salon, spa and beauty parlor.' },
  contact: {
    address: 'Demo address, Vijayawada',
    phone: '+91 90000 00000',
    email: 'hello@example.com',
    map_url: 'https://maps.example.com',
  },
  hours: [{ days: 'Monday – Saturday', open: '10:00', close: '20:00' }],
  social: [],
  video: { url: '' },
  achievements: [],
  offers: [],
  faqs: [{ id: 1, question: 'When do I pay?', answer: 'After we confirm your request.' }],
  stats: { services: 2, team: 1, divisions: { salon: 2, spa: 0, 'beauty-parlor': 0 } },
  policies: [
    { key: 'privacy', title: 'Privacy notice' },
    { key: 'terms', title: 'Terms of service' },
    { key: 'cancellation', title: 'Cancellation policy' },
  ],
};

export const haircut: Service = {
  id: 's1',
  slug: 'womens-haircut',
  name: "Women's Haircut",
  summary: 'Cut and finish to suit your hair length.',
  description: '',
  division: 'salon',
  category: { name: 'Haircuts', slug: 'salon-haircuts' },
  audience: 'women',
  from_price: '500.00',
  min_duration: 45,
  max_duration: 75,
  image_url: '',
  tags: [],
  variants: [
    { id: 'v1', label: 'Short hair', price: '500.00', duration_minutes: 45 },
    { id: 'v2', label: 'Long hair', price: '900.00', duration_minutes: 75 },
  ],
  addons: [{ id: 'a1', label: 'Bond-repair treatment', price: '800.00', duration_minutes: 20 }],
};

export const beard: Service = {
  ...haircut,
  id: 's2',
  slug: 'beard-trim-shape',
  name: 'Beard Trim & Shape',
  summary: 'Trim, line-up and hot-towel finish.',
  audience: 'men',
  from_price: '150.00',
  min_duration: 20,
  max_duration: 20,
  variants: [],
  addons: [],
};

export const rahul: TeamMember = {
  id: 't1',
  display_name: 'Rahul',
  title: 'Senior Hair Stylist',
  specialization: 'Cuts, colour and keratin',
  bio: '',
  photo_url: '',
  divisions: ['salon'],
  rating: null,
};
