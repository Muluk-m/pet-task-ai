CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `ai_extraction_logs` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `generated_contents` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `materials` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
INSERT INTO `users` (`username`, `password_hash`) VALUES ('nain', 'pbkdf2$10000$qFrYUWQ5wOjmvFw5I3Qurw==$evEa01SZ7/mf6QiLKDiMAMQ5oZlSzdKU9wjyYuCp74Q=');
--> statement-breakpoint
UPDATE `tasks` SET `user_id` = 1 WHERE `user_id` IS NULL;
--> statement-breakpoint
UPDATE `materials` SET `user_id` = 1 WHERE `user_id` IS NULL;
--> statement-breakpoint
UPDATE `generated_contents` SET `user_id` = 1 WHERE `user_id` IS NULL;
