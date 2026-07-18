export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'phone'
  | 'email'
  | 'city'
  | 'number'
  | 'unknown';

export interface FormField {
  element: any; // Playwright Locator or element handle context
  type: FormFieldType;
  label: string;
  placeholder?: string;
  name?: string;
  options?: string[]; // For select, radio, checkbox groups
  required: boolean;
  value?: string;
}

export interface CandidateProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  linkedin: string;
  github: string;
  portfolio: string;
  experience: number;
  remote: boolean;
  relocate: boolean;
  visaSponsorship: boolean;
  additionalInfo?: Record<string, string | number | boolean>;
}

export interface JobPlatform {
  openJob(url: string): Promise<void>;
  detectApplyMethod(): Promise<boolean>; // Returns true if "Easy Apply" or automated option is present
  fillApplication(): Promise<void>; // Runs the multi-step filling logic
  review(): Promise<void>; // Stops on review/submit page
  close(): Promise<void>;
}
