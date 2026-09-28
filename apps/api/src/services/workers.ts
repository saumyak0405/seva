import type { Worker } from '../db/schema.js';

/** What households see. No phone number, no ID details. */
export function publicWorker(w: Worker) {
  return {
    id: w.id,
    name: w.name,
    services: w.services,
    locality: w.locality,
    city: w.city,
    languages: w.languages,
    experienceYears: w.experienceYears,
    hourlyRate: w.hourlyRate,
    monthlyRate: w.monthlyRate,
    bio: w.bio,
    verified: w.verified,
  };
}

/** What Seva staff see. The encrypted ID is never returned — only type and last 4 digits. */
export function adminWorker(w: Worker) {
  return {
    ...publicWorker(w),
    phone: w.phone,
    active: w.active,
    verifiedAt: w.verifiedAt,
    idType: w.idType,
    idLast4: w.idLast4,
    hasIdOnFile: w.idNumberEnc != null,
    createdAt: w.createdAt,
  };
}
