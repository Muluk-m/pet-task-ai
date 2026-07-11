DROP INDEX `tasks_user_deadline_idx`;--> statement-breakpoint
CREATE INDEX `tasks_status_deadline_idx` ON `tasks` (`status`,`deadline`);