export const SELECTORS = {
  // Apply trigger buttons on Indeed Job page
  applyButton: [
    'button.indeedApplyButton',
    '#indeedApplyButton',
    'span:has-text("Apply Now")',
    'button:has-text("Apply Now")',
    'a:has-text("Apply Now")'
  ],

  // Form container
  formContainer: [
    'div.ia-BasePage',
    'div.ia-NavigationContainer',
    'form',
    'body'
  ],

  // Navigation / Action Buttons
  nextButton: [
    'button:has-text("Continue")',
    'button:has-text("Next")',
    'button[type="submit"]'
  ],

  submitButton: [
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
    'button:has-text("Post application")'
  ]
};
