# US: The People — App Analysis Session Notes
*June 7, 2026*

---

## The Concept

**US: The People** is a civic engagement app that gives citizens a direct, secure way to express approval or disapproval of political decisions in real time. The core idea is that aggregate public opinion becomes a visible accountability signal for elected representatives — beyond just election cycles.

### Core Features (from the deck)
- **Secure identity verification** on registration (comparable to financial/trading apps)
- **Interest-based onboarding** — users select areas like Economics, Environment, Politics, etc., and provide address/county/state
- **AI-monitored legislative sessions** — notifies users when relevant bills are introduced
- **AI-generated bill summaries** — key points, potential impacts, pros and cons
- **Approve / Disapprove voting** per bill — simple, direct stance expression
- **US Approval Ranking** — a continuous public approval rating for elected officials and governments, updated beyond election cycles
- **Counter-Perspective Mode** — encourages thoughtful participation without forcing neutrality (not fully defined in the deck)
- **Representative Response Channel** — verified officials can acknowledge sentiment, post short text-only explanations, respond to aggregate (not individuals). No debates, no comments.
- **Civic Calendar** — upcoming votes, local hearings, deadlines relevant to the user

### Vision Statement (from Slide 11)
> "US, The People exists to reflect public opinion, not to shape it, sell it, amplify it, or weaponize it."

---

## What the Deck Covers Well

- Strong problem framing: the disconnect between citizens and representatives
- Clear core value proposition: simple approve/disapprove + AI bill summaries + interest filtering
- Key differentiator: the "US Ranking" as a continuous accountability signal beyond elections
- Good product tone: "US is about voice, not control"

---

## What's Missing for Full App Development

### 1. User Flows & Screens
No wireframes, screen list, or user journeys defined. Needed at minimum:
- Onboarding / registration flow
- Home feed (bill feed UI)
- Bill detail view (summary, pros/cons, approve/disapprove)
- Profile / settings
- Politician ranking page
- Notifications experience
- Representative Response Channel UI
- Civic Calendar screen

### 2. Authentication & Identity Verification
Deck mentions "secure authentication comparable to financial/trading apps" but doesn't specify:
- What verification method? (ID upload, SSN, phone OTP, OAuth, government ID API?)
- One-time KYC or ongoing?
- How to prevent fake accounts without killing adoption with friction?
- How is address kept current if a user moves?

### 3. Data Sources — The Core Technical Pipeline
Biggest gap. The whole app depends on:
- Where does bill/legislation data come from? (Congress.gov API? OpenStates? LegiScan?)
- What level of government is in scope? Federal only? State? Local? Municipal?
- How does AI "monitor upcoming legislative sessions"? (Polling schedule? Webhooks? Manual curation?)
- Who writes/QAs the AI summaries? Is there a human review layer?
- How are "pros and cons" generated — by what model, and with what bias-prevention approach?

### 4. The "US Ranking" System
Most politically sensitive and technically complex feature — barely defined in deck:
- Is the ranking a raw approval %, weighted average, or something else?
- Is it per-bill or a rolling aggregate?
- How is it segmented? (By district only? All users? Verified local constituents only?)
- Who can see it — everyone, or only verified constituents of that representative?
- How do you prevent coordinated manipulation (brigading, astroturfing)?

### 5. Representative Verification
Slide 8 mentions verified officials in the Response Channel but:
- How are officials verified? (Manual onboarding, government email, OAuth with official systems?)
- Do they opt in, or are profiles created without their consent?
- What's the incentive for them to participate?

### 6. Platform Scope
- iOS? Android? Web? All three?
- MVP feature set vs. full vision — what ships first?
- Geographic scope at launch — US only? One state as a pilot?

### 7. Business Model & Sustainability
- Free to users? Always?
- Revenue model — institutional subscriptions (think tanks, parties, civic orgs)? Grant-funded? Nonprofit?
- Who pays for AI inference, data pipelines, identity verification infrastructure?

### 8. Privacy & Legal
- This is political data about real people — what's the data retention policy?
- Are votes anonymized or linkable to identity?
- CCPA / GDPR compliance?
- Risk of being classified as a political tool subject to FEC regulation?
- What happens with subpoenas for user voting data?

### 9. Counter-Perspective Mode
Mentioned in Slide 8 but completely undefined:
- What does it actually do?
- Does it surface opposing views? Force users to read counterarguments before voting?
- Needs a concrete UI/UX spec before development.

---

## Key Clarifying Questions to Answer Before Development

### Scope
1. What's the MVP? (Federal bills only? One state pilot?)
2. Mobile-first or web-first?
3. What's the target launch timeline?

### Identity
4. How do you verify a user is a real person and constituent without making registration painful?
5. Is voting anonymous, pseudonymous, or tied to real identity?

### Data
6. What government data APIs are you planning to integrate with?
7. What AI model/service generates summaries, and who audits them for bias?

### Product
8. What does "Counter-Perspective Mode" concretely look like in the UI?
9. Is the Civic Calendar manually curated or pulled from an external source?
10. What's the exact formula/methodology for the US Approval Ranking?

### Legal / Ethics
11. Have you consulted with a lawyer about political data liability?
12. What's the abuse prevention strategy — coordinated campaigns, bots, astroturfing?

### Business
13. What's the funding model? Who's paying for infrastructure?
14. Is this a nonprofit, startup, or something else?

---

## Next Steps Discussed

The deck reads as a pitch/vision document — which is appropriate for its stage — but before writing any code, the concept needs to be translated into:

1. **A proper PRD** (Product Requirements Document) with defined screens, data sources, and MVP scope
2. **User flow diagrams** covering the core journeys
3. **Technical architecture decisions** especially around the data pipeline (legislation sources) and AI summary generation
4. **Legal review** given the political data sensitivity

Claude offered to help draft the PRD as a next step.

---

## Source Material
- Uploaded file: `US__The_People.pptx` (11 slides)
- Slides 1, 9, 10 were blank/visual-only
- Core content was in Slides 2–8 and 11
