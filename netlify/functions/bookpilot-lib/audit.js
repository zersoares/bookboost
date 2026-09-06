// Append-only audit trail (spec §33).
//
// Written with the service role because `authenticated` has no INSERT
// grant on audit_log — a user can read their own history but can never
// write or erase an entry.
//
// Rule for what goes in `detail`: identifiers and outcomes, never
// content. Book descriptions, ad copy and personal data stay out of the
// log so an export or a breach of the log alone reveals nothing.

import { dbAsService } from "./db.js";

export async function record(userId, action, { entity = null, entityId = null, detail = {} } = {}) {
  try {
    await dbAsService().insert(
      "audit_log",
      { user_id: userId, action, entity, entity_id: entityId ? String(entityId) : null, detail },
      { returning: false }
    );
  } catch (err) {
    // Auditing must never break the operation being audited.
    console.error("[bookpilot] audit write failed:", action, err);
  }
}
