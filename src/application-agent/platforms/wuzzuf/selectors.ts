export const SELECTORS = {
  // Apply trigger buttons on Wuzzuf Job page
  applyButton: [
    'button:has-text("Apply for Job")',
    'button.css-wi58gx',
    'a:has-text("Apply for Job")',
    '.css-wi58gx'
  ],

  // Form wrapper / container on Wuzzuf application dialog or page
  formContainer: [
    'form',
    'div.css-1l5bdc6',
    '.css-1l5bdc6',
    'body'
  ],

  // Action buttons
  nextButton: [
    'button:has-text("Next")',
    'button:has-text("Save and Continue")',
    'button:has-text("Continue")'
  ],

  submitButton: [
    'button:has-text("Submit Application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")'
  ]
};
