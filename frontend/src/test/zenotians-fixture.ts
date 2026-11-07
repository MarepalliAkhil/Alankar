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
    summary:
      'B.Tech CSE undergraduate (CGPA 8.7) with hands-on experience in Python/ML projects, full-stack development, and Linux and networking coursework (Red Hat RH134, Cisco). Looking for a software or infrastructure role where I can build, deploy, and troubleshoot reliable systems.',
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
      {
        title: 'Predictive Fraud Prevention System',
        url: 'https://github.com/x/fraud.git',
        tech: 'Python',
        bullets: ['Trained models.'],
      },
      {
        title: 'NowCart',
        url: 'https://github.com/x/NowCart.git',
        tech: 'React 18',
        bullets: ['Built a frontend.'],
      },
    ],
    experience: [
      { role: 'Intern', org: 'EduSkills', period: 'Jul 2025 to Sep 2025', bullets: ['Worked.'] },
    ],
    skills: [{ group: 'Languages', items: ['Java', 'Python'] }],
    certifications: [
      { title: 'Cisco Networking Essentials', detail: '', url: CERTS },
      {
        title: 'Red Hat System Administration II (RH134)',
        detail: 'Certificate of Attendance',
        url: CERTS,
      },
      { title: 'Cambridge Linguaskill General', detail: 'English, CEFR B2', url: CERTS },
    ],
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
    leadership: [
      {
        name: 'Sudheer Koneru',
        title: 'Founder & CEO',
        bio: [
          'Founded Zenoti in 2010 (it began as ManageMySpa) and leads the company as CEO.',
          'Earlier in his career he worked at Microsoft.',
          'He was also CEO of Intelliprep, which merged into SumTotal Systems.',
          "Zenoti's website says his leadership made it the first unicorn in its industry, and that it powers over 30,000 businesses worldwide.",
          'He holds degrees from IIT Madras and the University of Texas at Austin.',
        ],
        sources: ['https://www.zenoti.com/company/zenoti-leadership'],
        last_checked: '2026-11-07',
        photo: '',
        photo_credit: '',
      },
      {
        name: 'Neal Singh',
        title: 'COO',
        bio: [
          'Runs global operations at Zenoti, including product development, engineering, implementation, customer success and support.',
          'Zenoti announced his appointment as President and COO in November 2023, and said he would also oversee its investments in payments and fintech.',
          'He was previously COO at Icertis.',
          'Before that he was President and CEO of Caradigm, a GE Healthcare company.',
          'He spent over a decade at Microsoft, helping build its Dynamics enterprise ERP portfolio, and has more than 20 years in the software industry.',
        ],
        sources: [
          'https://www.zenoti.com/company/zenoti-leadership',
          'https://www.zenoti.com/press/neal-singh-industry-veteran-from-microsoft-ge-and-icertis-joins-zenoti-as-president-coo',
        ],
        last_checked: '2026-11-07',
        photo: '',
        photo_credit: '',
      },
      {
        name: 'Dheeraj Koneru',
        title: 'Founder & SVP, Global Product Sales',
        bio: [
          'Co-founded Zenoti and has led its expansion into new regions and new areas such as fitness and gym management.',
          'Before Zenoti he managed Latitudes Health Club and Tangerine Spas.',
          'He co-founded Intelliprep Technologies, which later merged with Click2Learn.',
          'He held leadership roles at SumTotal Systems and Microsoft.',
          'He holds a Ph.D. in Particle Physics from Cornell University.',
        ],
        sources: ['https://www.zenoti.com/company/zenoti-leadership'],
        last_checked: '2026-11-07',
        photo: '',
        photo_credit: '',
      },
      {
        name: 'Anand Arvind',
        title: 'Founder & Chief Product Officer',
        bio: [
          'Co-founded Zenoti and, as Chief Product Officer, leads its technology vision.',
          'Has over 20 years of experience in enterprise software.',
          'Was Vice President of Products at SumTotal Systems, where he led a platform used by over 20 million users.',
          'Contributed to Windows System Restore at Microsoft.',
          'Holds degrees from BITS Pilani and Ohio State University, and an MBA from the Indian School of Business.',
        ],
        sources: ['https://www.zenoti.com/company/zenoti-leadership'],
        last_checked: '2026-11-07',
        photo: '',
        photo_credit: '',
      },
      {
        name: 'Sunil Koneru',
        title: 'Senior VP, Customer Experience',
        bio: [
          'Leads professional services and customer experience at Zenoti.',
          "Has been at Zenoti for more than 11 years, according to the company's page.",
          "Earlier he held engineering leadership roles in Microsoft's Xbox and Interactive Entertainment division.",
          "Holds a Master's degree in computer engineering from the University of South Carolina.",
        ],
        sources: ['https://www.zenoti.com/company/zenoti-leadership'],
        last_checked: '2026-11-07',
        photo: '',
        photo_credit: '',
      },
    ],
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
  mapping: [
    { workflow: 'Booking', built: 'Requests.', not_built: 'Single shop.', limits: ['single-shop'] },
  ],
  story: {
    intro: 'One fictional day.',
    note: 'The people are made up.',
    characters: [
      { name: 'Priya', role: 'Customer', line: 'Books on her phone.' },
      { name: 'Rahul', role: 'Receptionist', line: 'Confirms.' },
    ],
    chapters: [
      {
        visual: 'request',
        title: 'Priya asks for a slot',
        body: 'On her phone.',
        behind: 'A request, not a booking.',
        where: ['shared/policy.json'],
      },
      {
        visual: 'approval',
        title: 'Two yeses',
        body: 'Reception and stylist both accept.',
        behind: 'Both must accept.',
        where: [],
      },
    ],
  },
  quality: {
    intro: 'What was measured.',
    accuracy: [
      {
        name: 'Chatbot',
        hits: 9,
        total: 10,
        measured_on: '2026-11-05',
        how: 'A fixed list.',
        caveat: 'Small list.',
        where: [],
      },
    ],
    checks: [{ title: 'Role isolation', detail: 'Denied tests.', where: [] }],
    verify_note: 'Re-run before presenting.',
  },
  security: {
    intro: 'How data is protected.',
    items: [{ title: 'Argon2', body: 'Passwords are hashed.', where: [] }],
  },
  limitations: {
    intro: 'What it does not do.',
    items: [
      {
        id: 'single-shop',
        area: 'One shop',
        today: 'One shop only.',
        out_of_scope: 'Many shops.',
        where: [],
      },
    ],
  },
  demo: { logins: [], guide: [] },
};
