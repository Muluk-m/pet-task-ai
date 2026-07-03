ALTER TABLE `task_steps` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `order_channel` text;