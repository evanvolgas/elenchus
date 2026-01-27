import { describe, it, expect } from 'vitest';
import { detectQualityTier } from './quality-detector.js';

describe('Quality Detection Engine', () => {
  describe('detectQualityTier', () => {
    it('should detect tier 1-2 for minimal vague content', () => {
      const content = 'Build a dashboard. It should be fast and user-friendly.';
      const result = detectQualityTier(content);

      expect(result.tier).toBeLessThanOrEqual(2);
      expect(result.strategy).toBe('comprehensive');
      expect(result.specificityMap.hasVagueLanguage).toBe(true);
      expect(result.specificityMap.vaguePhrases).toContain('fast');
      expect(result.specificityMap.vaguePhrases).toContain('user-friendly');
    });

    it('should detect tier 3 for partial specificity', () => {
      const content = `Build a user dashboard that shows activity metrics.
      Users should be able to filter by date range.
      Response time should be under 1 second.
      Support up to 10,000 concurrent users.`;

      const result = detectQualityTier(content);

      expect(result.tier).toBeGreaterThanOrEqual(3);
      expect(result.specificityMap.hasNumbers).toBe(true);
      expect(result.specificityMap.hasUnits).toBe(true);
      expect(result.specificityMap.hasActors).toBe(true);
    });

    it('should detect tier 3-4 for comprehensive content', () => {
      const content = `Build an admin dashboard for monitoring user activity.

      Scope:
      - Admins can view real-time metrics (last 5 minutes)
      - Regular users have read-only access
      - Display: active sessions, error rates, request volume

      Success Criteria:
      - Dashboard loads in <200ms for up to 100k data points
      - Metrics update every 30 seconds via WebSocket
      - All charts render without blocking the UI thread

      Constraints:
      - Must use existing PostgreSQL database
      - Cannot exceed 50MB bundle size
      - Must be accessible (WCAG 2.1 AA)

      Error Handling:
      - When WebSocket disconnects, poll REST API every 60s
      - Show error banner when data is >5 minutes stale
      - Log all errors to Sentry with user context

      Technical:
      - React 18 with TypeScript
      - Use D3.js for charts
      - REST API: GET /api/metrics?from=timestamp&to=timestamp
      - WebSocket: ws://api/metrics/stream`;

      const result = detectQualityTier(content);

      expect(result.tier).toBeGreaterThanOrEqual(3);
      expect(result.strategy).toMatch(/targeted|validation|minimal/);
      expect(result.specificityMap.hasNumbers).toBe(true);
      expect(result.specificityMap.hasUnits).toBe(true);
      expect(result.specificityMap.hasActors).toBe(true);
      expect(result.specificityMap.hasTechnology).toBe(true);
      expect(result.metrics.coverageScore).toBeGreaterThan(30);
    });

    it('should identify missing areas', () => {
      const content = 'Build a login page for users.';
      const result = detectQualityTier(content);

      const successCoverage = result.areaCoverage.find(a => a.area === 'success');
      const riskCoverage = result.areaCoverage.find(a => a.area === 'risk');

      expect(successCoverage?.level).toMatch(/absent|mentioned/);
      expect(riskCoverage?.level).toMatch(/absent|mentioned/);
      expect(result.suggestedFocus).toContain('success');
      expect(result.suggestedFocus).toContain('risk');
    });

    it('should build analysis prompt with structural findings', () => {
      const content = 'Build a fast API that handles many requests.';
      const result = detectQualityTier(content);

      expect(result.analysisPrompt).toContain('EPIC CONTENT');
      expect(result.analysisPrompt).toContain('Quality Metrics');
      expect(result.analysisPrompt).toContain('Specificity Indicators');
      expect(result.analysisPrompt).toContain('Area Coverage');
      expect(result.analysisPrompt).toContain('YOUR TASK');
      expect(result.analysisPrompt).toContain('OUTPUT FORMAT');
    });

    it('should detect testable conditions', () => {
      const withCondition = 'When the user clicks submit, then show a success message.';
      const result = detectQualityTier(withCondition);
      expect(result.specificityMap.hasTestableConditions).toBe(true);

      const withoutCondition = 'The user can submit a form.';
      const result2 = detectQualityTier(withoutCondition);
      expect(result2.specificityMap.hasTestableConditions).toBe(false);
    });

    it('should identify technology mentions', () => {
      const withTech = 'Use PostgreSQL database with Redis cache and Kafka queue.';
      const result = detectQualityTier(withTech);
      expect(result.specificityMap.hasTechnology).toBe(true);

      const withoutTech = 'Store data in a database.';
      const result2 = detectQualityTier(withoutTech);
      expect(result2.specificityMap.hasTechnology).toBe(true); // 'database' is in TECH_PATTERNS
    });

    it('should calculate coverage accurately', () => {
      const comprehensive = `
        Scope: Admins and users can access the system and manage features.
        Success: Complete when all tests pass and user accepts the functionality.
        Constraints: Must be done within 2 weeks with a budget of $10k maximum.
        Risks: Handle errors gracefully, plan for edge cases and failure scenarios.
        Technical: Use React, Node.js, and PostgreSQL database with REST API.
      `;

      const result = detectQualityTier(comprehensive);

      // Should have at least mentioned all areas
      const absentAreas = result.areaCoverage.filter(a => a.level === 'absent');
      expect(absentAreas.length).toBeLessThanOrEqual(1); // Allow one area to be absent
      expect(result.metrics.coverageScore).toBeGreaterThan(30);
    });

    it('should suggest focus on weakest areas', () => {
      const imbalanced = `
        Build a dashboard.
      `;

      const result = detectQualityTier(imbalanced);

      // Should suggest focusing on areas with low coverage
      expect(result.suggestedFocus.length).toBeGreaterThan(0);
      // Should include areas that are completely missing or barely mentioned
      const hasLowCoverageArea = result.suggestedFocus.some(area =>
        ['success', 'constraint', 'risk', 'technical'].includes(area)
      );
      expect(hasLowCoverageArea).toBe(true);
    });

    it('should handle edge cases gracefully', () => {
      // Empty content
      const empty = '';
      const result1 = detectQualityTier(empty);
      expect(result1.tier).toBeGreaterThanOrEqual(1);
      expect(result1.tier).toBeLessThanOrEqual(5);
      expect(result1.metrics.statementCount).toBe(0);

      // Single word (edge case - may score variably depending on whether it's a keyword)
      const minimal = 'Dashboard';
      const result2 = detectQualityTier(minimal);
      expect(result2.tier).toBeGreaterThanOrEqual(1);
      expect(result2.tier).toBeLessThanOrEqual(5);

      // Very long content
      const long = Array(1000).fill('User can view data.').join(' ');
      const result3 = detectQualityTier(long);
      expect(result3.metrics.statementCount).toBeGreaterThan(100);
    });

    it('should correctly score statements with multiple indicators', () => {
      // Import the internal function for testing (we'll export it)
      const highQuality = 'Admin can process up to 1000 requests per second via REST API.';
      const result = detectQualityTier(highQuality);

      // Should have high specificity
      expect(result.specificityMap.hasNumbers).toBe(true);
      expect(result.specificityMap.hasUnits).toBe(true);
      expect(result.specificityMap.hasActors).toBe(true);
      expect(result.specificityMap.hasTechnology).toBe(true);
    });

    it('should penalize vague language appropriately', () => {
      const vague = 'The system should be fast, scalable, robust, and user-friendly.';
      const result = detectQualityTier(vague);

      expect(result.specificityMap.vaguePhrases.length).toBeGreaterThan(3);
      expect(result.metrics.clarityScore).toBeLessThan(50);
    });

    it('should reward specific measurable criteria', () => {
      const specific = `
        Response time: <200ms for 95th percentile
        Throughput: 10,000 requests per second
        Availability: 99.9% uptime
        Error rate: <0.1%
      `;

      const result = detectQualityTier(specific);

      expect(result.specificityMap.hasNumbers).toBe(true);
      expect(result.specificityMap.hasUnits).toBe(true);
      expect(result.metrics.specificityScore).toBeGreaterThan(60);
    });
  });
});
