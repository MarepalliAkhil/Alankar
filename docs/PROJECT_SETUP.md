# Using this kit with your "Alankar" the assistant project

## 1. Folder
Unzip the kit to a permanent folder, e.g. `C:\dev\salon-app`. Do not move it later.

## 2. Connect
Open your Alankar project and select this folder as its working folder. Allow access when asked.
No files need to be created by hand. If the project only accepts uploads, add:
the project rules file, docs/MASTER_NOTES.md, docs/START_HERE.md, docs/CHATBOT_ALGORITHM.md, docs/PROGRESS.md
(skip docs/archive and reference/ until Task 8).

## 3. Project instructions (paste into the instructions box)
```
You are building "Alankar", a unisex salon, spa and beauty-parlor website and management system. The platform's working name is ZenFlow.
At the start of EVERY session, read the project rules file, docs/MASTER_NOTES.md and docs/PROGRESS.md fully before doing anything.
Rules: follow the project rules file strictly. No LLMs or external AI APIs anywhere. The chatbot is a deterministic engine. Do one task at a time. Commit before and after each task. At the end of each task, update docs/PROGRESS.md. If something conflicts with the notes, ask me instead of guessing.
```
*(Note, 2026-11: the "no LLMs" rule was later narrowed by the owner for AIR only: AIR may use an optional third-party language model, off by default, with a server-side key, caps and customer consent. See docs/AIR.md. The chatbot engine is still deterministic.)*

## 4. First message
```
Read the project rules file, docs/MASTER_NOTES.md and docs/PROGRESS.md fully. Confirm the plan in 10 lines. Do not write code yet.
```
Check the summary (roles, Alankar site, no LLMs, PostgreSQL from day one), then run Task 0 from docs/START_HERE.md Step 4.

## 5. Tools to install first
Git for Windows, Node.js LTS, Python 3.12+, Docker Desktop (PostgreSQL).
An AI coding assistant of your choice (optional).

## 6. Cowork vs Code tab
Use the Code tab for building (runs servers, tests, git). Use Cowork for documents, notes and Zenotians page content. Same folder, same Pro usage.

## 7. Each session
One task per session. Commit before and after. Update docs/PROGRESS.md at the end.
