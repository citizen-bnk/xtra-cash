import { qualitativePlanningMessage } from './offer-assistant.service';

describe('offer planning explanations', () => {
  it('removes inconsistent AI prices while preserving qualitative trade-offs', () => {
    expect(qualitativePlanningMessage('We set a R500 service fee. Smaller limits can reduce concentration. Review affordability before lending.')).toBe('Smaller limits can reduce concentration. Review affordability before lending.');
  });
  it('removes decimal rates and credit thresholds from prose', () => {
    expect(qualitativePlanningMessage('Charge 3.5% monthly. A score of 600 guarantees low risk. Funding and operating costs still matter.')).toBe('Funding and operating costs still matter.');
  });
});
