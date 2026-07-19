import { randomUUID } from 'node:crypto';
import {
  PreparedAnswerSchema,
  QuestionCategorySchema,
  type ApplicationQuestion,
  type CandidateProfile,
  type PreparedAnswer
} from '../schemas/index.js';

const SENSITIVE_PATTERNS: Array<[RegExp, ReturnType<typeof QuestionCategorySchema.parse>]> = [
  [/salary|compensation|pay|expected income/i, 'salary'],
  [/sponsor|visa/i, 'sponsorship'],
  [/relocat/i, 'relocation'],
  [/gender|race|ethnicity|veteran|marital|religion/i, 'demographic'],
  [/authorized|legally|right to work|criminal|declaration/i, 'legal'],
  [/background check/i, 'background_check'],
  [/disab/i, 'disability'],
  [/security clearance/i, 'security_clearance'],
  [/resume|cv|upload|file/i, 'file_upload']
];

export function classifyQuestion(label: string): ReturnType<typeof QuestionCategorySchema.parse> {
  for (const [pattern, category] of SENSITIVE_PATTERNS) if (pattern.test(label)) return category;
  if (/email|phone|contact/i.test(label)) return 'contact';
  if (/name/i.test(label)) return 'identity';
  if (/experience|years|skill/i.test(label)) return 'experience';
  return 'unknown';
}

function fact(profile: CandidateProfile, field: string) {
  return profile.facts.find((candidate) => candidate.field === field);
}

export function prepareAnswer(question: ApplicationQuestion, profile: CandidateProfile): PreparedAnswer {
  let proposedAnswer = '';
  let confidence = 0;
  let supportingFactIds: string[] = [];

  const useFact = (fieldName: string, fallback: string | number | boolean | null): void => {
    const supportingFact = fact(profile, fieldName);
    proposedAnswer = String(supportingFact?.value ?? fallback ?? '');
    confidence = supportingFact?.verified ? 1 : supportingFact ? 0.75 : 0;
    supportingFactIds = supportingFact ? [supportingFact.id] : [];
  };

  switch (question.category) {
    case 'identity': {
      const first = fact(profile, 'identity.firstName');
      const last = fact(profile, 'identity.lastName');
      proposedAnswer = `${first?.value ?? profile.identity.firstName} ${last?.value ?? profile.identity.lastName}`.trim();
      supportingFactIds = [first?.id, last?.id].filter((id): id is string => Boolean(id));
      confidence = first?.verified && last?.verified ? 1 : 0.7;
      break;
    }
    case 'contact':
      if (/phone/i.test(question.label)) useFact('contact.phone', profile.contact.phone);
      else useFact('contact.email', profile.contact.email);
      break;
    case 'experience': {
      const experienceFact = fact(profile, 'experience.totalYears');
      if (/years|number/i.test(question.label)) useFact('experience.totalYears', experienceFact?.value ?? profile.experience.length);
      else proposedAnswer = profile.skills.join(', ');
      confidence = experienceFact?.verified ? 1 : 0.8;
      supportingFactIds = experienceFact ? [experienceFact.id] : [];
      break;
    }
    case 'sponsorship':
      useFact('sponsorshipRequired', profile.sponsorshipRequired === null ? '' : profile.sponsorshipRequired ? 'Yes' : 'No');
      if (proposedAnswer === 'true') proposedAnswer = 'Yes';
      if (proposedAnswer === 'false') proposedAnswer = 'No';
      break;
    case 'relocation':
      useFact('relocationPreference', profile.relocationPreference);
      break;
    case 'salary':
      useFact('salaryPreferences.minimum', profile.salaryPreferences.minimum);
      break;
    case 'file_upload': {
      const cv = profile.approvedCvVariants.find((variant) => variant.approved);
      proposedAnswer = cv?.path ?? '';
      confidence = cv ? 1 : 0;
      supportingFactIds = cv ? [`cv:${cv.id}`] : [];
      break;
    }
    case 'legal':
      useFact('workAuthorization', profile.workAuthorization.length > 0 ? 'Yes' : '');
      if (profile.workAuthorization.length > 0) proposedAnswer = 'Yes';
      break;
    default:
      proposedAnswer = '';
      confidence = 0;
  }

  const alwaysConfirm = new Set([
    'salary', 'sponsorship', 'relocation', 'demographic', 'legal', 'background_check',
    'disability', 'security_clearance', 'file_upload', 'unknown'
  ]);
  return PreparedAnswerSchema.parse({
    questionId: question.id,
    proposedAnswer,
    confidence,
    supportingFactIds,
    confirmationRequired: alwaysConfirm.has(question.category) || confidence < 0.85,
    model: { provider: 'local-deterministic', model: 'verified-fact-mapper-v1' },
    createdAt: new Date().toISOString()
  });
}

export function questionFrom(label: string, type: ApplicationQuestion['type'], required = true, options: string[] = []): ApplicationQuestion {
  return {
    id: randomUUID(),
    label,
    type,
    required,
    options,
    category: classifyQuestion(label)
  };
}
