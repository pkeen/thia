CREATE SCHEMA IF NOT EXISTS "thia";
--> statement-breakpoint
CREATE TABLE "thia"."account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_user_id_provider_provider_account_id_pk" PRIMARY KEY("user_id","provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "thia"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"password_hash" text,
	"token_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "thia"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "thia"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compositeUniqueIndex" ON "thia"."account" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emailUniqueIndex" ON "thia"."user" USING btree (lower("email"));