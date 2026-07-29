STANDING RULES FOR THIS REPO

1. Do not ask clarifying questions. If a decision point is ambiguous, choose
   the option that best satisfies the written spec, record the choice and the
   reasoning in DECISIONS.md, and continue.

2. A phase is complete when `pnpm phase:close <n>` exits 0 and its full
   unedited output is pasted, and at no other time. A green local
   `npm run evidence` run is not completion: it is only one of the six
   checks the gate runs, and it passes locally even when CI on the pushed
   SHA is red, which is exactly how phases 12 and 13 were reported done
   over failing CI. Do not declare a phase done, and do not move to the
   next phase, on any weaker signal. If you did not run it, do not claim it.

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

8. After each phase, run `npm run evidence`. That script regenerates
   EVIDENCE.md from real command output, and claims in EVIDENCE.md that were
   not produced by that script are prohibited. A passing evidence run is
   necessary but not sufficient for completion: completion is decided only
   by `pnpm phase:close <n>` (see rule 2), which additionally requires a
   clean pushed tree, green CI on that exact SHA, and passing acceptance
   tests.

9. A phase is not closed until CI is green on the pushed SHA. This is the
   lesson of phases 12 and 13, which were reported complete while CI was
   red because a local run was green: a local pass proves nothing about the
   pushed commit. Query CI for the exact SHA, treat in-progress and missing
   checks as failures, and never infer status from a previous SHA.

10. "Simulated" verification does not satisfy an acceptance criterion that
    says observed. When a criterion says a real scheduler, a real run, or a
    real credential-free environment, meet it by observing the real thing.
    A simulation, a computed proxy, or a "would have worked" argument does
    not count. If the real observation is genuinely impractical, report that
    as a failing or not-testable criterion (rule 7), do not substitute a
    simulation and call it met.
