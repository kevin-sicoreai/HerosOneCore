# Ontology Service — Design

Semantic layer: turn datasets into typed **object types** with **properties** and
**links**, the shared model that explorer / analysis / app-builder / assist consume.

## Position in the data flow

```
data (raw)  →  pipeline (mart)  →  ontology (object types + links)  →  explorer / analysis / apps
```

Object types are backed by datasets in the data service catalog; instances are
read on demand from the backing Parquet — the ontology stores only the *model*.

## Concepts

- **ObjectType** — backed by a dataset; properties imported from its schema; has a
  primary key, a display name, and canvas coordinates.
- **Property** — a field (name, type, primary-key flag).
- **LinkType** — directed relationship joined on
  `from_object_type.from_property == to_object_type.to_property`, with a cardinality.
- **Object instance** — a row in the backing dataset, queried via DuckDB.

## Metadata model (ontology service DB — model only, no instances)

```
object_types (id, api_name, display_name, dataset_id, primary_key, color, x, y)
properties   (id, object_type_id, name, data_type, is_primary_key, ordinal)
link_types   (id, api_name, display_name, from_object_type_id, to_object_type_id,
              from_property, to_property, cardinality)
```

## Instance access

Instances are read live from the backing dataset's Parquet (DuckDB):
- list / preview, count
- link traversal: given an instance and a link, return the related objects on the
  other end (string-cast key comparison to stay type-agnostic).

## Status

**Implemented & verified:** object type CRUD (schema auto-import), link type CRUD,
`/graph` (nodes + links + instance counts), instance list/count, link traversal.
Frontend `/ontology` wired to `/graph` with a property panel. Verified end-to-end
building Customer + Order object types from the data service's datasets and
traversing Customer → Orders.

**Next:** interactive editor (create object types / draw links in the UI);
instance detail drawer + link navigation; write-back from pipeline `output`
nodes to object types; governance lineage over object types.
