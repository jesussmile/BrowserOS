CREATE TABLE `local_goal_queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_run_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`source_url` text,
	`artifact_path` text,
	`metadata_json` text,
	`evidence_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_run_id`) REFERENCES `local_goal_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_goal_queue_items_goal_order_unique` ON `local_goal_queue_items` (`goal_run_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `local_goal_queue_items_goal_status_idx` ON `local_goal_queue_items` (`goal_run_id`,`status`);--> statement-breakpoint
CREATE TABLE `local_goal_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_run_id` text NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`state_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_run_id`) REFERENCES `local_goal_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_goal_checkpoints_goal_created_idx` ON `local_goal_checkpoints` (`goal_run_id`,`created_at`);
