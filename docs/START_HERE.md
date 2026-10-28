# START HERE: Hand-off to Claude Code / Cowork

Claude Code and Cowork run as **separate sessions**. They cannot see this chat. So we give them the plan as files in your project folder; they read the files, and you do not need to re-discuss anything.

## Step 1: Create the project folder

```
salon-app/                 (use a neutral folder name, not the product name)
  CLAUDE.md                (the rules file I wrote; edit the "Defaults" section if you disagree)
  docs/
    MASTER_NOTES.md        (rename ZENFLOW_MASTER_NOTES.md to this)
    PROGRESS.md            (create it, empty heading is fine: "# Progress")
    CHATBOT_ALGORITHM.md   (the chatbot algorithm spec)
    archive/               (put the older ZENFLOW_*_PROMPTS.md files here, for reference only)
  reference/
    chatbot_reference/     (the tested Python reference implementation of the chatbot)
```

## Step 2: Open the folder in the tool
- **Recommended: Claude Code** (the Code tab in the Claude desktop app, or the terminal/VS Code extension). Point it at the `salon-app` folder.
- If you use **Cowork**, grant it access to the same folder. Cowork is aimed at everyday file work, so for heavy coding Claude Code is the better fit.
- `git init` first, so every task can be committed.

## Step 3: First message (paste this)

```
Read CLAUDE.md, docs/MASTER_NOTES.md and docs/PROGRESS.md fully before doing anything.
Confirm in 10 lines what you understood: the shop Alankar and its public website, the four roles with their menus, the booking and payment-link workflow, the chatbot,
the stack, the branding rule and the design-system rule. List any conflicts or gaps you noticed.
Do not write code yet.
```
Check its summary. If it is wrong, correct it before continuing.

## Step 4: Task 0 (scaffold and foundation)

```
TASK 0: Project scaffold and foundation. Plan first (short), then implement.

1. Monorepo: backend/ (Django 5, DRF, apps: accounts, people, scheduling, billing, inventory, chat, marketing, core)
   and frontend/ (Vite, React 18, TypeScript, Tailwind, React Router, react-query, Axios, zod).
2. PostgreSQL via docker-compose (and instructions for local Postgres if Docker is unavailable).
   .env.example files for both sides (never commit .env). Settings read from env.
3. Backend: health endpoint /api/health/, drf-spectacular docs at /api/docs/, CORS for the Vite dev server,
   pytest + pytest-django configured with one passing test, ruff configured.
4. Branding: frontend/src/config/brand.ts and backend/core/brand.py (name "ZenFlow", tagline
   "Book smarter. Serve faster. Grow automatically."). Nothing else may hard-code the name.
5. Design system: frontend/src/design/tokens.ts + CSS variables (colours, radii, shadows, blur, spacing, fonts, motion)
   using the initial tokens from CLAUDE.md. Base components in src/components/ui built only from tokens:
   Button, IconButton, Input, PasswordInput, Select, Card (glass), Badge/StatusBadge, Avatar, Modal, Drawer, Toast,
   Tabs, Table, EmptyState, Skeleton. A /design-system page that shows them all.
6. Routing skeleton: public home page at "/" (navbar: shop title as Home, Salon, Spa, Beauty Parlor, Book Now, Login, Register, and a set-apart "For Zenotians"), division page shells (/salon, /spa, /beauty-parlor), /login with four role tabs (Customer, Stylist, Receptionist, Admin), /register (customers), /zenotians shell, 404 and 403 pages. The app must NOT open on login.
   A top-level ErrorBoundary and a Suspense fallback so a crash never produces a blank page.
7. Scripts: `npm run dev|build|lint|test`, `pytest`, `ruff check`. A root README with run instructions.
8. Create docs/PROGRESS.md with the status, decisions and next task (Task 1: auth and policy).

Do NOT build feature pages yet. Verify: both servers run, /api/health/ is OK, role picker renders, design-system page renders,
all tests/lint/build pass. Then summarise files created and commit.
```

## Step 5: Start every later session with this

```
Read CLAUDE.md and docs/PROGRESS.md. Summarise where we are in 5 lines, then continue with the next task in PROGRESS.md.
Plan first, keep the task small, follow the Definition of Done, update PROGRESS.md, and commit.
```
This replaces the memory a new session doesn't have.

## Step 6: Task list to feed one at a time
1. **Task 1:** auth, role picker flow, invites, policy file, audit log, lockout, permission tests (allowed and denied).
2. **Task 2:** public Alankar website (home, Salon/Spa/Beauty Parlor pages, service cards, popup sheets, footer, content from database) + booking sheet + customer slice (register/login/OTP, request, payment-link flow with simulated email and mock payment, My Appointments cards, invoices, profile, mandatory rating gate).
3. **Task 3:** receptionist slice (request cards, assign drawer, schedule drag-and-drop, check-in, customers, POS, cash close, My Hours & Pay).
4. **Task 4:** stylist slice and Zen Chat (person cards, real-time, encrypted).
5. **Task 5:** admin slice (staff, services/catalogue, inventory, marketing, reports, settings, audit, security, refunds).
6. **Task 6:** ratings, work sessions, payroll, Staff Summary graphs.
7. **Task 7:** "AI Alankar Intelligence" chatbot: port `reference/chatbot_reference/` into `backend/chatbot/` following `docs/CHATBOT_ALGORITHM.md` (no LLMs, no Ollama, no keys), connect it to the database, build the corner widget (7a port and data, 7b API and widget, 7c admin insights and accuracy).
8. **Task 8:** hardening and the Playwright full-workflow test with four users.
9. **Task 9:** the "For Zenotians" page design, built to `docs/MASTER_NOTES.md` section 36 (left sidebar: Overview, About me as a resume, The project, How it maps to Zenoti, Engineering decisions, Try the demo, Contact; admin-editable; About me only from the resume you provide; Zenoti-inspired but no Zenoti logo or wordmark; footer "Independent portfolio project, not affiliated with Zenoti").
10. **Task 10:** admin assistant that handles things with commands (rule-based, no LLM, same permissions and audit log as the admin screens, asks for confirmation before any change).
11. **Task 11:** stage 2, the owner's custom UI design.
12. **Task 12:** to be decided later (deployment is not assigned to a task yet).
Split any task that feels too big into two. Ask me (in the planning chat) for the exact prompt for each task if you want one written in detail.

## What this chat is still good for
Keep using this chat as your **planning, review and debugging partner**: ask for the detailed prompt for the next task, paste errors or screenshots, ask design or architecture questions, or have me review code you paste. I can't see or edit your project files from here, so anything you want reviewed needs to be pasted or uploaded.

## Usage tips (Pro plan)
- One task per session; clear the conversation between tasks.
- Use the fast model for routine work, the strongest only for hard logic (scheduling engine, payroll maths).
- Commit before and after every task, so a cut-off run costs nothing.
