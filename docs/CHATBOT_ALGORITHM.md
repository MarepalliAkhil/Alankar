# AI Alankar Intelligence: Question-Understanding Algorithm

**Rule: no LLMs, no Ollama, no external AI services, no API keys, no ML libraries.** The chatbot is a deterministic program built from text processing, a rule table, a search formula (BM25) and the application's own database. It understands a question by **rewriting it into a standard form** (the "rephrase"), then answers only from data it can point to.

The reference implementation is in `alankar_intelligence/` (Python standard library only, about 600 lines, 16 passing tests). Claude Code should port it into the Django app (`backend/chatbot/`) and keep the same module boundaries.

---

## 1. Pipeline (every message goes through these steps in order)

```
user text
 0. Guard           cap at 500 chars; empty -> fallback; Telugu/Hindi SCRIPT -> language note
 1. Normalize       lowercase, strip symbols, expand contractions (what's -> what is),
                    abbreviations (appt -> appointment, pls -> please),
                    Telugu/Hindi written in English letters (kitna/entha -> how much, ekkada -> location)
 2. Spell-correct   only against the shop's own vocabulary (see 2.2)
 3. Stem            light suffix stripping, applied identically to questions and knowledge
 4. Canonicalize    THE REPHRASE: synonym and phrase tables map many ways of asking to one standard form
                    ("how much for hair cut" -> price haircut; "change my appointment time" -> reschedule time)
 5. Entities        services, division (salon/spa/parlor), audience (men/women/kids), stylist names
 6. Score intents   weighted keywords + phrases + entity boosts (+ personal-data bonus)
 7. Decide          accept / ask "did you mean" / follow-up / catalogue / knowledge-base search / fallback
 8. Answer          from templates + the knowledge base + catalogue + the USER'S OWN records (via tools)
 9. Explain         return the rephrased question ("I understood: ...") built from canonical data
```

### 2.1 Normalize
- NFKC Unicode normalisation, lowercase, remove control/zero-width characters, replace the rupee sign with "rupees".
- Keep letters, digits, spaces, apostrophes and hyphens; everything else becomes a space.
- Dictionaries: `CONTRACTIONS`, `ABBREVIATIONS`, `TRANSLIT` (Telugu/Hindi in English letters). They are plain tables; add words freely.
- Telugu or Devanagari **script** is not understood. The bot says so politely and asks the user to type in English letters.

### 2.2 Spell correction (Damerau-Levenshtein, optimal string alignment)
A token is corrected only if ALL are true: length >= 4; not a number; not already in the vocabulary; not a common English word; a vocabulary word exists with the **same first letter** and edit distance <= 1 (words up to 6 letters) or <= 2 (longer). Ties go to the more frequent word.
The vocabulary is built from the shop's own text (knowledge base, service names and aliases, stylist names, synonym tables, intent keywords). That is why "massge" becomes "massage" but ordinary words are left alone.

### 2.3 Stemming
`services -> servic`, `booking -> book`, `cancelled/cancellation -> cancel`, `schedule/scheduling -> schedul`. It does not need to be linguistically perfect, only **consistent**, because the same function is applied to the knowledge base and to the question.
**Stem collisions:** when two different words share a stem (time/timing, rate/rates) use the `surface` table in `synonyms.json`, which maps the exact written form **before** stemming.

### 2.4 Canonicalization (the rephrase)
Two tables in `synonyms.json`:
- `words`: many words -> one canonical word (cost, charge, fee, amount -> price; ladies, girl, female -> women; barber, therapist -> stylist).
- `phrases`: multi-word phrases -> canonical words (how much -> price; how long -> duration; sign in -> login; change my appointment -> reschedule). **Longest phrase wins.**
After this step "what is the cost", "how much", "charges?" and "kitna" are all the same token: `price`.

### 2.5 Entities
- **Service:** a service matches when all words of one of its aliases appear in the question. The **longest alias wins**, so "head massage" selects Head Massage only, while "massage" selects both massages and "haircut for women" selects only Women's Haircut.
- **Division:** salon / spa / parlor, but words already consumed by a service alias are ignored ("hair spa" is a service, not the Spa division).
- **Audience:** men / women / kids. **Stylist:** by first name.

### 2.6 Intent scoring
For each intent:
```
raw  = sum(weight of each distinct keyword present)
     + sum(bonus of each phrase present; words in order, at most 1 word between them)
     + entity boosts (only if the intent already scored > 0)
     + personal bonus (+1.5 when "my" is present and the intent reads the user's own data;
                       +0.5 instead for "how do I ..." questions)
skip the intent if a `requires` word is missing or an `excludes` word is present
conf = raw / (raw + 2)            # 3 -> 0.60, 5 -> 0.71, 8 -> 0.80
```
Filler words (a, the, to, do, you, can ...) are removed first so phrases such as "how to book" and "rate my stylist" match.

### 2.7 Decision rules (constants in `engine.py`)
| Situation | Action |
|---|---|
| best conf >= 0.60 and (second < 0.60 or lead >= 0.10 or best >= 0.80) | answer that intent |
| two intents both >= 0.60 and close | ask "Did you mean ...?" with both rephrased questions as tap-able chips |
| low confidence, but the previous topic + a short message that names a service/audience ("and for women?") | follow-up: reuse the last intent with the new entity |
| a service, division or audience is named but no clear question | describe it from the catalogue |
| otherwise | BM25 search of the knowledge base; answer if confidence >= 0.45 |
| otherwise | honest fallback with the phone number, and record the normalized question for the admin |

### 2.8 Knowledge-base search (BM25)
Standard BM25 with k1 = 1.5 and b = 0.75 over each entry's question and tags (counted twice) plus its answer. Query = canonical stems minus stop-words and question words. `confidence = score / (score + 3)`.

### 2.9 Answering and grounding
- Every answer is built from **data**: knowledge-base entries (placeholders such as `{hours}`, `{phone}` filled from the shop settings), the service catalogue (prices, durations), the stylist list (name, specialisation, rating only), and, for logged-in users, **their own** records through `tools`.
- **Personal intents** (my next appointment, my invoices, my points, my history, my appointments): a guest gets "please log in"; a logged-in user gets only the rows the tools return for their own id. The engine never receives or queries anyone else's data.
- **The rephrased question and every reply are built from canonical data and templates, never by echoing raw user text**, so user input can't inject content into a reply.
- **Unknown means unknown:** the bot says it isn't sure, offers contact details, and stores the anonymous normalized question so the admin can add a knowledge-base entry (see 4).

---

## 3. Data the admin controls (no code changes needed)
| Data | Where | Effect |
|---|---|---|
| Knowledge entries (question, answer, tags) | Settings -> Chatbot knowledge | new answers; used by BM25 and by intents mapped to them |
| Services, aliases, prices, durations | Services | price/duration/recommendation answers update instantly |
| Stylists (name, specialisation, rating) | Staff | team answers |
| Shop info (hours, address, phone, email, cancellation window, link validity) | Settings -> Website content | placeholders in answers |
| Synonyms and Telugu/Hindi words | `synonyms.json` / admin editor (optional) | better understanding |

After any change, rebuild the in-memory engine (a Django signal can call `Engine(...)` again). Typical question time is well under 10 ms.

## 4. How it gets better without AI
1. The engine logs `unanswered_key` (normalized, anonymous) for every fallback.
2. The admin sees the most frequent unanswered questions, writes a knowledge entry for each, and optionally adds synonyms.
3. Re-run the test suite; add the new question to `CASES`.

## 5. Safety and privacy
- No outbound network calls from the chatbot (a test fails the build if network or ML libraries are imported).
- Input capped at 500 characters; rate-limit the endpoint (for example 20 requests per minute per user/IP).
- Do not store raw chat text with user ids by default. If a history is kept, keep it per user, retention-limited, and not readable by admin.
- User text can never change roles or permissions; actions are limited to **links and prefilled forms**, and any state-changing action needs an explicit confirm button that goes through the normal policy layer.

## 6. Django integration plan
- `backend/chatbot/engine/` = this package. `backend/chatbot/tools.py` implements the `tools` methods using the existing services and permission layer, always filtered by `request.user`.
- Endpoint `POST /api/chatbot/ask/` with body `{message, session_id}` returns the `Reply` fields. `Session` (last intent and entities) is kept server-side per user/session with a short expiry.
- The engine is built from the database (services, stylists, site settings, knowledge entries) at startup and rebuilt when those change.
- Frontend: corner toggle widget titled **AI Alankar Intelligence**; render `text`, `actions` as buttons, `suggestions` as chips, and `I understood: <rephrased>` when `show_rephrase` is true.

## 7. Honest limits
- It understands the **topics it has rules and knowledge for**. It cannot reason about arbitrary questions or write free-form answers, and it will say "I'm not sure" instead of guessing.
- Accuracy: the 58-question tuning set and the 36-question second set both pass in the tests, **but I tuned the rules after the second set first scored 75%**, so treat 75 to 90% on genuinely new questions as the realistic expectation on day one. It improves as the admin adds entries and as you add real questions to the tests.
- Spelling correction covers typos and common Telugu/Hindi words in English letters, not full sentences in other languages or in non-Latin scripts.

## 8. Test plan (already in `tests/test_engine.py`)
Intent accuracy sets; typo rephrase; gender and service precision; "hair spa" is not the Spa division; follow-ups; guest cannot see personal data; users see only their own data; payment-link personalisation; unknown falls back; prompt-injection attempts leak nothing; raw input is never echoed; non-Latin script message; empty and very long input; no banned imports (requests, urllib, openai, ollama, anthropic, transformers, torch, numpy, sklearn).
