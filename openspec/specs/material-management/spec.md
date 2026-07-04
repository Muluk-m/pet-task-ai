# material-management Specification

## Purpose
TBD - created by archiving change generalize-content-and-queued-images. Update Purpose after archive.
## Requirements
### Requirement: Generated image material source
The system SHALL allow completed queued image generation results to be saved as image materials. The materials page SHALL direct users to the dedicated image generation page for creating AI images, rather than requiring generation inside an inline modal or sheet.

#### Scenario: Open image generation from materials
- **WHEN** the user is on the materials page and chooses AI image generation
- **THEN** the system navigates to the dedicated image generation page

#### Scenario: Generated image appears in materials
- **WHEN** the user saves a completed generated image as a material
- **THEN** the material appears in the materials list and can be used by later content generation
