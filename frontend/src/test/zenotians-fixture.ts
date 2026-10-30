import type { ZenotiansContent } from '../api/zenotians';

const CERTS = 'https://drive.example.com/folder';

/** A complete page, shaped like the seeded content (phone off, demo and achievements empty). */
export const fullContent: ZenotiansContent = {
  overview: {
    headline: 'Built for Zenotians: a working platform',
    intro: 'A salon platform.',
    start_here: ['Read the project.'],
    demo_url: '',
    github_url: '',
    resume_pdf_url: '',
  },
  resume: {
    name: 'AKHIL MAREPALLI',
    location: 'Vijayawada, India',
    contacts: [
      { key: 'email', label: 'Email', value: 'akhil@example.com', public: true },
      { key: 'linkedin', label: 'LinkedIn', value: 'https://www.linkedin.com/in/x', public: true },
      { key: 'github', label: 'GitHub', value: 'https://github.com/x', public: true },
      {
        key: 'portfolio',
        label: 'Portfolio',
        value: 'https://portfolio.example.com/',
        public: true,
      },
      { key: 'phone', label: 'Phone', value: '+91-9000000000', public: false },
    ],
    summary: 'B.Tech CSE undergraduate.',
    education: [
      {
        school: 'KL University',
        place: 'Vijayawada',
        period: '2023 to Present',
        program: 'B.Tech',
        result: 'CGPA 8.7',
      },
    ],
    projects: [
      {
        title: 'W.A.N.D.',
        url: 'https://github.com/x/WAND.git',
        tech: '',
        bullets: ['Built a thing.'],
      },
    ],
    experience: [
      { role: 'Intern', org: 'EduSkills', period: 'Jul 2025 to Sep 2025', bullets: ['Worked.'] },
    ],
    skills: [{ group: 'Languages', items: ['Java', 'Python'] }],
    certifications: [{ title: 'Cisco Networking Essentials', detail: '', url: CERTS }],
    achievements: [],
    pdf_url: '',
  },
  zenoti: {
    label: 'Public information from Zenoti’s website',
    last_checked: '2026-10-30',
    founded_year: 2010,
    founded_text: 'Founded in 2010 as ManageMySpa.',
    founded_source: 'https://www.zenoti.com/company',
    customers_text: 'Over 30,000 businesses',
    customers_note: 'Their page is undated.',
    customers_source: 'https://zenoti.com/choose-zenoti',
    leadership: [{ name: 'A Person', title: 'Founder & CEO' }],
    leadership_source: 'https://www.zenoti.com/company/zenoti-leadership',
    offices: ['Hyderabad'],
    offices_source: 'https://www.zenoti.com/company',
    investors: ['Accel'],
    investors_source: 'https://www.zenoti.com/company',
  },
  project: {
    intro: 'A guest books.',
    roles: [
      { role: 'Customer', does: ['Books.'] },
      { role: 'Receptionist', does: ['Confirms.'] },
      { role: 'Stylist', does: ['Serves.'] },
      { role: 'Admin', does: ['Reviews.'] },
    ],
    stack: [{ layer: 'Front end', items: ['React 18'] }],
    security: ['Argon2.'],
  },
  mapping: [{ workflow: 'Booking', built: 'Requests.', not_built: 'Single shop.' }],
  decisions: [{ title: 'One policy file', body: 'Why.', where: ['shared/policy.json'] }],
  vision: {
    intro: 'Alankar today uses no AI. This is a concept.',
    roles: [
      {
        role: 'Customer',
        data_in: ['Questions'],
        today: ['Chatbot'],
        future: ['Style matching'],
        guardrails: ['Audit log'],
      },
    ],
    overview_note: 'A person decides.',
  },
  demo: { logins: [], guide: [] },
};
