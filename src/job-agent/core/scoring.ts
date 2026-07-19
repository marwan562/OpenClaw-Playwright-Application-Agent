import { MatchScoreSchema, type CandidateProfile, type Job, type MatchScore } from '../schemas/index.js';

export interface ScoreWeights {
  requiredSkills: number;
  preferredSkills: number;
  experience: number;
  seniority: number;
  location: number;
  remote: number;
  workAuthorization: number;
  salary: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  requiredSkills: 30,
  preferredSkills: 10,
  experience: 15,
  seniority: 10,
  location: 10,
  remote: 10,
  workAuthorization: 10,
  salary: 5
};

const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]/g, '');

function overlap(wanted: string[], actual: string[]): number {
  if (wanted.length === 0) return 1;
  const actualSet = new Set(actual.map(canonical));
  return wanted.filter((item) => actualSet.has(canonical(item))).length / wanted.length;
}

export function scoreJob(
  job: Job,
  profile: CandidateProfile,
  options: { excludedKeywords?: string[]; weights?: Partial<ScoreWeights> } = {}
): MatchScore {
  const weights = { ...DEFAULT_SCORE_WEIGHTS, ...options.weights };
  const profileSkills = profile.skills;
  const required = overlap(job.requiredSkills, profileSkills);
  const preferred = overlap(job.preferredSkills, profileSkills);
  const years = profile.experience.reduce((sum, item) => {
    const start = Date.parse(`${item.startDate}-01`);
    const end = item.endDate ? Date.parse(`${item.endDate}-01`) : Date.now();
    return sum + (Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) / 31_556_952_000 : 0);
  }, 0);
  const experience = Math.min(1, years / 3);
  const seniority = /senior|lead|principal/i.test(job.seniority ?? job.title) ? Math.min(1, years / 5) : 1;
  const sameCountry = profile.location.country && job.location.toLowerCase().includes(profile.location.country.toLowerCase());
  const location = sameCountry || job.workplaceType === 'remote' ? 1 : 0.4;
  const remote = job.workplaceType === 'remote' ? 1 : job.workplaceType === 'hybrid' ? 0.6 : 0.3;
  const authorization = job.location.toLowerCase().includes(profile.location.country.toLowerCase()) || profile.workAuthorization.some((place) => job.location.toLowerCase().includes(place.toLowerCase())) ? 1 : 0.4;
  const salary = !job.salary || profile.salaryPreferences.minimum === null || job.salary.maximum === null
    ? 0.7
    : job.salary.maximum >= profile.salaryPreferences.minimum ? 1 : 0;
  const ratios = { requiredSkills: required, preferredSkills: preferred, experience, seniority, location, remote, workAuthorization: authorization, salary };
  const components = Object.fromEntries(Object.entries(ratios).map(([key, ratio]) => [key, Math.round(ratio * weights[key as keyof ScoreWeights] * 100) / 100]));
  const excluded = (options.excludedKeywords ?? []).filter((word) => `${job.title} ${job.description}`.toLowerCase().includes(word.toLowerCase()));
  const rawScore = Object.values(components).reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore - excluded.length * 25)));
  const matchedRequired = job.requiredSkills.filter((skill) => profileSkills.some((candidate) => canonical(candidate) === canonical(skill)));
  const missingRequired = job.requiredSkills.filter((skill) => !matchedRequired.includes(skill));

  return MatchScoreSchema.parse({
    jobId: job.id,
    profileId: profile.id,
    score,
    components,
    explanation: [
      `${matchedRequired.length}/${job.requiredSkills.length || 0} required skills matched${matchedRequired.length ? `: ${matchedRequired.join(', ')}` : ''}.`,
      `${job.workplaceType} role in ${job.location || 'an unspecified location'}.`,
      `Estimated relevant experience: ${years.toFixed(1)} years.`
    ],
    blockingReasons: [
      ...missingRequired.map((skill) => `Missing required skill: ${skill}`),
      ...excluded.map((word) => `Excluded keyword present: ${word}`)
    ],
    calculatedAt: new Date().toISOString()
  });
}
