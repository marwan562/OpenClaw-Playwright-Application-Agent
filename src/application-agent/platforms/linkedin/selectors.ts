export const SELECTORS = {
  // Easy Apply trigger buttons on LinkedIn Job page
  easyApplyButton: [
    'button.jobs-apply-button[data-job-id]',
    'button.jobs-apply-button',
    '.jobs-apply-button button',
    'span:has-text("Easy Apply")'
  ],

  // Easy Apply Modal wrapper
  modalContainer: [
    'div.jobs-easy-apply-modal',
    '[role="dialog"]:has(.jobs-easy-apply-modal__content)',
    '.jobs-easy-apply-modal'
  ],

  // Form body inside Easy Apply modal
  modalFormContent: [
    '.jobs-easy-apply-modal__content',
    'form.jobs-easy-apply-explicit-form',
    '.jobs-easy-apply-form-section'
  ],

  // Navigation and action buttons within the modal
  nextButton: [
    'button[aria-label="Continue to next step"]',
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button[data-easy-apply-next-button]'
  ],

  reviewButton: [
    'button[aria-label="Review your application"]',
    'button:has-text("Review")',
    'button:has-text("Review your application")'
  ],

  submitButton: [
    'button[aria-label="Submit application"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
    'button:has-text("Post application")'
  ],

  closeButton: [
    'button[aria-label="Dismiss"]',
    'button.artdeco-modal__dismiss',
    'button:has-text("Cancel")'
  ],

  // Custom LinkedIn form fields (e.g. city select suggestions)
  citySuggestionItem: [
    'div.basic-typeahead__selectable',
    'li.typeahead-suggestion',
    '[role="option"]'
  ]
};
