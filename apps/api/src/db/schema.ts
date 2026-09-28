import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['HOUSEHOLD', 'ADMIN']);
export const serviceEnum = pgEnum('service_type', [
  'CLEANING',
  'COOKING',
  'BABYSITTING',
  'ELDER_CARE',
  'LAUNDRY',
  'GARDENING',
]);
export const bookingTypeEnum = pgEnum('booking_type', ['ONE_TIME', 'MONTHLY']);
export const bookingStatusEnum = pgEnum('booking_status', [
  'REQUESTED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]);
export const idTypeEnum = pgEnum('id_type', ['AADHAAR', 'VOTER_ID', 'PAN', 'DRIVING_LICENCE']);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 80 }),
  role: roleEnum('role').notNull().default('HOUSEHOLD'),
  address: varchar('address', { length: 300 }),
  locality: varchar('locality', { length: 80 }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

/** OTPs are stored only as HMAC-SHA256 hashes. */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: varchar('phone', { length: 10 }).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: ts('consumed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('otp_phone_created_idx').on(t.phone, t.createdAt)],
);

/** Workers are onboarded by an admin in v1 — many don't use web apps. */
export const workers = pgTable(
  'workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    phone: varchar('phone', { length: 10 }).notNull().unique(),
    services: serviceEnum('services').array().notNull(),
    locality: varchar('locality', { length: 80 }).notNull(),
    city: varchar('city', { length: 60 }).notNull().default('Agra'),
    languages: text('languages').array().notNull().default([]),
    experienceYears: integer('experience_years').notNull().default(0),
    /** Whole rupees */
    hourlyRate: integer('hourly_rate').notNull(),
    monthlyRate: integer('monthly_rate'),
    bio: varchar('bio', { length: 500 }),
    verified: boolean('verified').notNull().default(false),
    verifiedAt: ts('verified_at'),
    active: boolean('active').notNull().default(true),
    /** Only type + last 4 digits are readable; the full number is AES-256-GCM encrypted. */
    idType: idTypeEnum('id_type'),
    idLast4: varchar('id_last4', { length: 4 }),
    idNumberEnc: text('id_number_enc'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('workers_listing_idx').on(t.verified, t.active, t.locality)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => users.id),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id),
    type: bookingTypeEnum('type').notNull(),
    service: serviceEnum('service').notNull(),
    status: bookingStatusEnum('status').notNull().default('REQUESTED'),
    /** ONE_TIME: exact slot within a single IST day */
    startAt: ts('start_at'),
    endAt: ts('end_at'),
    /** MONTHLY: recurring daily window (minutes after midnight IST) from startDate */
    startDate: date('start_date', { mode: 'string' }),
    dailyStartMinute: integer('daily_start_minute'),
    dailyEndMinute: integer('daily_end_minute'),
    address: varchar('address', { length: 300 }).notNull(),
    notes: varchar('notes', { length: 500 }),
    /** Paid by the household directly to the worker (rupees) */
    priceRupees: integer('price_rupees').notNull(),
    /** Seva's online booking fee (rupees) */
    feeRupees: integer('fee_rupees').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('bookings_worker_status_idx').on(t.workerId, t.status),
    index('bookings_household_created_idx').on(t.householdId, t.createdAt),
  ],
);

/** Append-only audit trail of every booking status change. */
export const bookingEvents = pgTable(
  'booking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromStatus: bookingStatusEnum('from_status'),
    toStatus: bookingStatusEnum('to_status').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    note: varchar('note', { length: 300 }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('booking_events_booking_idx').on(t.bookingId, t.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({ bookings: many(bookings) }));
export const workersRelations = relations(workers, ({ many }) => ({ bookings: many(bookings) }));
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  household: one(users, { fields: [bookings.householdId], references: [users.id] }),
  worker: one(workers, { fields: [bookings.workerId], references: [workers.id] }),
  events: many(bookingEvents),
}));
export const bookingEventsRelations = relations(bookingEvents, ({ one }) => ({
  booking: one(bookings, { fields: [bookingEvents.bookingId], references: [bookings.id] }),
  actor: one(users, { fields: [bookingEvents.actorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type ServiceType = (typeof serviceEnum.enumValues)[number];
