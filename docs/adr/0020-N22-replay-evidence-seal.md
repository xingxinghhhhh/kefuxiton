# ADR-0020: N22 non-production replay diagnostic evidence sealing

## Status

Accepted as an isolated N22 experiment decision. This ADR does not authorize persistent evidence storage or a production evidence service.

## Decision

Add an in-memory `n22.v1` `EvidenceEnvelope` around a strictly validated `n21.v1` replay diagnostic report. The envelope contains only `schemaVersion`, `evidenceType`, `sourceSchemaVersion`, `digestAlgorithm`, `report`, and a lowercase SHA-256 `evidenceDigest`.

The digest covers the canonical UTF-8 JSON representation of the envelope without `evidenceDigest`, using the fixed field order and nested N21 field order. JSON has no whitespace, nulls are retained, and array order is preserved. Unknown fields, unsupported versions, malformed safe values, sensitive values, oversized reports, and oversized envelopes fail closed. Verification returns only a fixed status, reason code, and digest-match flag.

N19, N20, and N21 contracts remain unchanged. N22 does not rerun LangGraph, read fixtures, create a checkpointer, access a database/network/model, write a file, or import production modules. The envelope is an offline object only; 26 fixed evaluation cases cover 21 valid seals and five invalid/tampered inputs.

## Boundaries and rollback

N22 is not persistence, an evidence database, an API, a UI, monitoring, alerting, cross-process recovery, or a production audit record. Rollback removes N22 source, tests, eval entry, and docs, returning to N21 commit `81c9b35`; no data or migration rollback is required.
