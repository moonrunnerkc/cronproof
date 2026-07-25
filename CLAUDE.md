STANDING RULES FOR THIS REPO

1. Do not ask clarifying questions. If a decision point is ambiguous, choose
   the option that best satisfies the written spec, record the choice and the
   reasoning in DECISIONS.md, and continue.

2. Never claim a phase is complete without evidence. A completion claim must
   include: the exact command run, the real unedited output, and the file
   paths touched. If you did not run it, do not claim it.

3. Never write a number into docs, README, or commit messages that you did not
   measure in this repo. No estimated coverage, no "approximately", no
   projected performance. Measured or absent.

4. Every external factual claim (a GitHub issue, a scheduler's documented
   behavior, a CVE) must carry a URL you fetched in this session. If you
   cannot fetch it, delete the claim. Do not reconstruct it from memory.

5. Code standards: TypeScript strict, no `any` (no `unknown` casts used as
   `any` in disguise), named exports only, no default exports, kebab-case
   filenames, JSDoc on every exported symbol, 300-line hard file limit with
   decomposition required past it, no em dashes anywhere including comments.

6. Tests validate behavior, not wiring. No mock of the thing under test. Test
   names describe the observable behavior. A reader must understand what a
   test verifies without reading the implementation.

7. Stop and report if a phase's acceptance criteria cannot be met. Do not
   partially implement and describe it as done. Do not stub a function and
   move on. A failing acceptance criterion is a finding, report it as one.

8. After each phase, run `npm run evidence` and paste its output. That script
   regenerates EVIDENCE.md from real command output. Claims in EVIDENCE.md
   that were not produced by that script are prohibited.
