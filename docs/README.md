# Documentation

Use this index to distinguish design intent, planned work, and implemented behavior.

## Design decisions

| Record | Decision status | Implementation |
| --- | --- | --- |
| [ADR-001: OAuth cookie transactions](decisions/001-oauth-cookie-transactions.md) | Accepted | Cookie/PKCE feature merged; see record for verification limits |
| [ADR-002: PKCE provider requirements](decisions/002-pkce-provider-requirements.md) | Proposed blanket provider policy | PKCE implemented; policy acceptance is separate |
| [ADR-003: Selectable session policy](decisions/003-selectable-session-policy.md) | Accepted | Delivered by Sprint 001 |

## Sprints

| Brief | Created | Status |
| --- | --- | --- |
| [Sprint 001: Session policy](sprints/001-session-policy.md) | 2026-09-26 | Completed 2026-09-27 |
| [Sprint 002: Refresh-token rotation](sprints/002-refresh-token-rotation.md) | 2026-09-27 | Ready for implementation |

## Feature documentation

The active demo's [README](../apps/thia-clean-builder-app/README.md) contains
setup, OAuth and session guidance. Cross-package feature guides:

- [Session policies](guides/session-policies.md): stateless vs user-validated
  JWT sessions, sign out everywhere, and changing policy.

Add further guides under `docs/guides/` as features are delivered. Sprint
briefs are not substitutes for usage guides.

## Naming and lifecycle

- Decisions: `decisions/NNN-descriptive-name.md`, referenced as ADR-NNN.
- Sprints: `sprints/NNN-descriptive-name.md`, referenced as Sprint NNN.
- Number decisions and sprints independently. Allocate the next unused number;
  never renumber or reuse an existing identifier.
- Keep filenames stable. Put dates and statuses inside documents, not in names.
- Decisions record creation date and Proposed, Accepted, or Superseded status.
  Track implementation separately. Link superseded records to their replacements.
- Sprints record creation date, status, and completion date when completed.
  Use Ready for implementation, In progress, Completed, or Cancelled.
- On sprint completion, record delivered scope, verification, and deferred work,
  then update feature guides and this index. Do not leave completed work labelled
  as a future task.
- Guides use descriptive unnumbered names, such as `guides/session-policies.md`,
  and describe verified current behavior rather than historical plans.
