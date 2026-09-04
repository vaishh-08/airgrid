---
name: OpenAPI and Zod compatibility
description: Generated integer schemas currently need a compatibility workaround in this workspace.
---

OpenAPI integer fields currently generate `zod.int()` helpers that are incompatible with the workspace's installed Zod 3 runtime; use numeric schemas at the API boundary when codegen must pass.

**Why:** The generated client and server validation packages share a Zod 3 dependency even though the generator can emit newer Zod APIs.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run codegen and the root library typecheck before building routes.