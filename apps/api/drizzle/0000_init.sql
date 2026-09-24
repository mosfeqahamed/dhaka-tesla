CREATE TYPE "public"."driver_status" AS ENUM('ONLINE', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TESLAPAY');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PASSENGER', 'DRIVER');--> statement-breakpoint
CREATE TABLE "zone_distances" (
	"from_zone_id" smallint NOT NULL,
	"to_zone_id" smallint NOT NULL,
	"distance_m" integer NOT NULL,
	CONSTRAINT "zone_distances_from_zone_id_to_zone_id_pk" PRIMARY KEY("from_zone_id","to_zone_id"),
	CONSTRAINT "zone_distances_distinct_zones" CHECK ("zone_distances"."from_zone_id" <> "zone_distances"."to_zone_id"),
	CONSTRAINT "zone_distances_positive" CHECK ("zone_distances"."distance_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "zones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"name" varchar(64) NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	CONSTRAINT "zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"password_hash" varchar(100) NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"plate_no" varchar(32) NOT NULL,
	"capacity" smallint NOT NULL,
	"driver_status" "driver_status" DEFAULT 'OFFLINE' NOT NULL,
	"current_zone_id" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_plate_no_unique" UNIQUE("plate_no"),
	CONSTRAINT "vehicles_capacity_positive" CHECK ("vehicles"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_paisa" integer NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_ride_request_id_unique" UNIQUE("ride_request_id"),
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"seats" smallint NOT NULL,
	"distance_m" integer NOT NULL,
	"base_fare_paisa" integer NOT NULL,
	"distance_charge_paisa" integer NOT NULL,
	"pool_discount_paisa" integer DEFAULT 0 NOT NULL,
	"total_fare_paisa" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_members_ride_request_id_unique" UNIQUE("ride_request_id"),
	CONSTRAINT "pool_members_seats_positive" CHECK ("pool_members"."seats" >= 1),
	CONSTRAINT "pool_members_distance_positive" CHECK ("pool_members"."distance_m" > 0),
	CONSTRAINT "pool_members_fare_components_non_negative" CHECK ("pool_members"."base_fare_paisa" >= 0 AND "pool_members"."distance_charge_paisa" >= 0 AND "pool_members"."pool_discount_paisa" >= 0),
	CONSTRAINT "pool_members_fare_adds_up" CHECK ("pool_members"."total_fare_paisa" = "pool_members"."base_fare_paisa" + "pool_members"."distance_charge_paisa" - "pool_members"."pool_discount_paisa")
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"status" "pool_status" DEFAULT 'ACCEPTED' NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pools_capacity_positive" CHECK ("pools"."capacity" > 0),
	CONSTRAINT "pools_seats_within_capacity" CHECK ("pools"."seats_taken" BETWEEN 0 AND "pools"."capacity")
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"dropoff_zone_id" smallint NOT NULL,
	"seats" smallint NOT NULL,
	"status" "request_status" DEFAULT 'REQUESTED' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"estimated_fare_paisa" integer NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requests_passenger_idempotency_key" UNIQUE("passenger_id","idempotency_key"),
	CONSTRAINT "ride_requests_seats_positive" CHECK ("ride_requests"."seats" >= 1),
	CONSTRAINT "ride_requests_distinct_zones" CHECK ("ride_requests"."pickup_zone_id" <> "ride_requests"."dropoff_zone_id"),
	CONSTRAINT "ride_requests_fare_non_negative" CHECK ("ride_requests"."estimated_fare_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "status_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ride_request_id" uuid,
	"pool_id" uuid,
	"from_status" varchar(32),
	"to_status" varchar(32) NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_events_one_entity" CHECK (num_nonnulls("status_events"."ride_request_id", "status_events"."pool_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_from_zone_id_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_to_zone_id_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_zone_id_zones_id_fk" FOREIGN KEY ("current_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_zone_id_zones_id_fk" FOREIGN KEY ("dropoff_zone_id") REFERENCES "public"."zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_members_pool_idx" ON "pool_members" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_active_per_vehicle" ON "pools" USING btree ("vehicle_id") WHERE "pools"."status" NOT IN ('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE INDEX "pools_status_pickup_idx" ON "pools" USING btree ("status","pickup_zone_id");--> statement-breakpoint
CREATE INDEX "pools_vehicle_created_idx" ON "pools" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" NOT IN ('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE INDEX "ride_requests_status_pickup_idx" ON "ride_requests" USING btree ("status","pickup_zone_id");--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_created_idx" ON "ride_requests" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE INDEX "status_events_request_created_idx" ON "status_events" USING btree ("ride_request_id","created_at");--> statement-breakpoint
CREATE INDEX "status_events_pool_created_idx" ON "status_events" USING btree ("pool_id","created_at");