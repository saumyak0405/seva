CREATE TYPE "public"."booking_status" AS ENUM('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('ONE_TIME', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."id_type" AS ENUM('AADHAAR', 'VOTER_ID', 'PAN', 'DRIVING_LICENCE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('HOUSEHOLD', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('CLEANING', 'COOKING', 'BABYSITTING', 'ELDER_CARE', 'LAUNDRY', 'GARDENING');--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_id" uuid NOT NULL,
	"note" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"type" "booking_type" NOT NULL,
	"service" "service_type" NOT NULL,
	"status" "booking_status" DEFAULT 'REQUESTED' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"start_date" date,
	"daily_start_minute" integer,
	"daily_end_minute" integer,
	"address" varchar(300) NOT NULL,
	"notes" varchar(500),
	"price_rupees" integer NOT NULL,
	"fee_rupees" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(10) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(10) NOT NULL,
	"name" varchar(80),
	"role" "role" DEFAULT 'HOUSEHOLD' NOT NULL,
	"address" varchar(300),
	"locality" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"phone" varchar(10) NOT NULL,
	"services" "service_type"[] NOT NULL,
	"locality" varchar(80) NOT NULL,
	"city" varchar(60) DEFAULT 'Agra' NOT NULL,
	"languages" text[] DEFAULT '{}' NOT NULL,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"hourly_rate" integer NOT NULL,
	"monthly_rate" integer,
	"bio" varchar(500),
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"id_type" "id_type",
	"id_last4" varchar(4),
	"id_number_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_household_id_users_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_worker_status_idx" ON "bookings" USING btree ("worker_id","status");--> statement-breakpoint
CREATE INDEX "bookings_household_created_idx" ON "bookings" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "otp_phone_created_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "workers_listing_idx" ON "workers" USING btree ("verified","active","locality");