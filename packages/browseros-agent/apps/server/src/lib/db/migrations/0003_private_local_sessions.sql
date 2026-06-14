CREATE TABLE `local_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_messaged_at` integer NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `local_sessions_last_messaged_at_idx` ON `local_sessions` (`last_messaged_at`);--> statement-breakpoint
CREATE INDEX `local_sessions_updated_at_idx` ON `local_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `local_sessions_status_updated_at_idx` ON `local_sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `local_session_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`order_index` integer NOT NULL,
	`message_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `local_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_session_messages_session_order_unique` ON `local_session_messages` (`session_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `local_session_messages_session_idx` ON `local_session_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `local_goal_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'paused' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`metadata_json` text,
	FOREIGN KEY (`session_id`) REFERENCES `local_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `local_goal_runs_session_idx` ON `local_goal_runs` (`session_id`);--> statement-breakpoint
CREATE INDEX `local_goal_runs_status_updated_at_idx` ON `local_goal_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `local_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`goal_run_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `local_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_run_id`) REFERENCES `local_goal_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `local_audit_events_session_created_idx` ON `local_audit_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `local_audit_events_goal_created_idx` ON `local_audit_events` (`goal_run_id`,`created_at`);
