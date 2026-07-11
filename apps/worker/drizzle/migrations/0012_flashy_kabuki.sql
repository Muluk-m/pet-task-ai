ALTER TABLE `task_steps` ADD `retain_until` text;--> statement-breakpoint
CREATE INDEX `task_steps_retain_until_idx` ON `task_steps` (`retain_until`);