CREATE INDEX `tasks_user_status_idx` ON `tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_user_deadline_idx` ON `tasks` (`user_id`,`deadline`);