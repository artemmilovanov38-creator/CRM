export function resolveApplicationManagerId({
  currentUserId = null,
  requestedManagerId = null,
  privileged = false,
} = {}) {
  if (privileged && requestedManagerId) {
    return requestedManagerId;
  }

  return currentUserId || null;
}

export function duplicateDecision({
  matches = [],
  confirmDuplicate = false,
} = {}) {
  const existing = (matches || []).filter(Boolean);

  if (existing.length === 0) {
    return {
      allow: true,
      needsConfirmation: false,
      existingProducts: [],
    };
  }

  if (confirmDuplicate) {
    return {
      allow: true,
      needsConfirmation: false,
      existingProducts: existing,
    };
  }

  return {
    allow: false,
    needsConfirmation: true,
    existingProducts: existing,
  };
}

export function contactOwnedByOther({
  contact = null,
  currentUserId = null,
} = {}) {
  if (!contact) {
    return false;
  }

  if (contact.owned_by_me === false || contact.shared_existing) {
    return true;
  }

  return Boolean(
    contact.manager_id &&
      currentUserId &&
      String(contact.manager_id) !== String(currentUserId)
  );
}

export function productHintLabel(hints = []) {
  const names = [];

  for (const hint of hints || []) {
    const name = String(
      hint?.product_name || hint?.product || ""
    ).trim();

    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}
