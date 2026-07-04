# content-generation Specification

## Purpose
TBD - created by archiving change generalize-content-and-queued-images. Update Purpose after archive.
## Requirements
### Requirement: Custom content requirements
The system SHALL allow users to provide free-form custom requirements when generating content. The custom requirements MUST be included in the AI prompt and SHALL take precedence over fixed style presets when they conflict.

#### Scenario: Generate with custom requirement
- **WHEN** the user enters a custom requirement such as "写成适合洗护用品的真实评价，不要提猫"
- **THEN** the generated content follows that requirement and does not assume the product is for cats unless the task or materials say so

### Requirement: Product-neutral generation
The system SHALL generate copy for any product category represented by the selected task, materials, or custom requirement. The AI prompt MUST NOT default to cat-only or pet-only content when no such context is provided.

#### Scenario: Generate non-pet copy
- **WHEN** the user selects no pet-specific task or material and asks for content about a household product
- **THEN** the generated content describes the household product context rather than inventing pet usage

### Requirement: Plain review content generation
The system SHALL continue to generate plain review text for ecommerce reviews and generic platform copy. Generated plain text SHALL be stored in generation history and remain copyable and savable as a copywriting material.

#### Scenario: Save generated review copy
- **WHEN** the user generates plain review text and chooses to save it as material
- **THEN** the system creates a copywriting material containing the generated text

### Requirement: Structured Xiaohongshu publishing content
The system SHALL support generating a structured Xiaohongshu publish payload with at least: title, body, hashtags, cover suggestion, image notes, and compliance notes. The Worker MUST validate the AI output against this schema before returning it to the client.

#### Scenario: Generate Xiaohongshu schema payload
- **WHEN** the user chooses Xiaohongshu publish mode and submits generation
- **THEN** the response contains a validated structured payload that can be used by a downstream one-click publishing integration

#### Scenario: Invalid structured output is rejected
- **WHEN** the AI returns content that cannot be parsed into the Xiaohongshu payload schema after retry
- **THEN** the system returns an error and does not save an invalid generation record

### Requirement: Generation history supports content modes
The system SHALL record which content mode produced each generation. History SHALL display enough information for the user to distinguish plain review text from structured Xiaohongshu publish payloads.

#### Scenario: View mixed generation history
- **WHEN** the user opens generation history after creating both plain text and Xiaohongshu structured content
- **THEN** the history distinguishes the two modes and shows the relevant generated content summary
