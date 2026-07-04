## ADDED Requirements

### Requirement: Submit queued image generation jobs
The system SHALL submit AI image generation requests to an external queue service instead of waiting synchronously for final image bytes. A submitted job SHALL immediately return a local job record with status `queued` or `in_progress`.

#### Scenario: Submit image job
- **WHEN** the user enters a prompt, selects model settings, and starts image generation
- **THEN** the system creates a local image generation job linked to the user and returns without waiting for the final image

### Requirement: Persist image job progress
The system SHALL persist local image job records including external request ID, prompt, provider, model, size, status, timestamps, errors, and result metadata. Jobs MUST be scoped to the authenticated user.

#### Scenario: Return after navigation
- **WHEN** the user starts an image job, leaves the page, and later opens the image generation page
- **THEN** the job is still visible with its latest known status

### Requirement: Poll queued image status
The system SHALL provide an API to refresh image job status from the external queue service. Terminal statuses SHALL include completed, failed, and cancelled. Completed jobs SHALL expose result image metadata and image fetch URLs through the pet app API.

#### Scenario: Job completes
- **WHEN** a queued external image request completes successfully
- **THEN** the local job status becomes completed and the page shows generated image results

#### Scenario: Job fails
- **WHEN** the external queue reports a failed job
- **THEN** the local job status becomes failed and the page shows the failure reason

### Requirement: Dedicated image generation page
The system SHALL provide a dedicated image generation page separate from the materials page. The page SHALL include the generation form, active jobs, completed results, and clear progress states.

#### Scenario: Generate while doing other work
- **WHEN** the user submits an image job and navigates to another page
- **THEN** the job continues in the background and the user can return to the image page to inspect progress or results

### Requirement: Save completed image results to materials
The system SHALL allow users to save selected completed generated images into the materials library. Saving MUST upload or copy the image into the pet app storage before creating a material record.

#### Scenario: Save generated result
- **WHEN** the user selects a completed generated image and chooses to save it as a material
- **THEN** the system stores the image in the pet app asset storage and creates a material with the selected title, type, and tags

### Requirement: Cancel queued image jobs
The system SHALL support cancelling queued or in-progress image jobs when the external queue service supports cancellation. Cancelled jobs SHALL remain visible in history with status `cancelled`.

#### Scenario: Cancel active job
- **WHEN** the user cancels an active image job
- **THEN** the system requests cancellation from the external service and updates the local job to cancelled when acknowledged
