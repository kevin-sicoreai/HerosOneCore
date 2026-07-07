# Governance Service — Design

Cross-cutting layer that observes the rest of the platform: it aggregates the
data / pipeline / ontology services into a **lineage graph** and an **audit
feed**, and holds a placeholder **access matrix**.

## Position

```
data ─┐
pipeline ─┼─► governance (aggregate) ─► lineage graph · audit feed · access matrix · stats
ontology ─┘
```

Governance stores almost nothing of its own (only roles); everything else is
assembled on demand from the upstream services' read APIs.

## Lineage

Nodes and edges built live:
- `connector → dataset` (dataset.connector_id)
- `dataset → pipeline` (pipeline source steps' dataset_id)
- `pipeline → mart` (pipeline outputs)
- `dataset → object_type` (object type's backing dataset)

## Audit

Assembled from real activity, newest first:
- data: connector sync runs
- pipeline: pipeline runs
- ontology: object-type creations

## Status

**Implemented & verified:** `/lineage` (assembles connector→dataset→pipeline→
mart→object_type), `/audit` (from syncs/runs/creations), `/roles` (seeded access
matrix), `/stats`. Frontend `/governance` wired: stat cards, lineage graph,
access matrix, audit log. Verified end-to-end against the running data / pipeline
/ ontology services.

**Next:** ingest live events (services publish to governance) instead of polling;
asset classification / ownership annotations; real RBAC from an auth service;
dedupe repeated mart outputs by name; policy enforcement.
