import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleValidate } from '../../src/tools/validate.js';
import type { Storage } from '../../src/storage/index.js';
import type { Specification } from '../../src/types/spec.js';

// Mock storage
const mockStorage: Storage = {
  saveEpic: vi.fn(),
  getEpic: vi.fn(),
  saveSession: vi.fn(),
  getSession: vi.fn(),
  saveContext: vi.fn(),
  getContext: vi.fn(),
  saveSpec: vi.fn(),
  getSpec: vi.fn(),
  listEpics: vi.fn(),
  listSessions: vi.fn(),
  deleteEpic: vi.fn(),
  deleteSession: vi.fn(),
};

// Helper to create a minimal valid spec
function createMockSpec(overrides: Partial<Specification> = {}): Specification {
  return {
    id: 'spec-1',
    epicId: 'epic-1',
    sessionId: 'session-1',
    version: 1,
    problem: 'This is a well-defined problem statement that is long enough',
    userPersona: 'Developer user persona',
    successMetrics: [
      {
        name: 'Performance',
        description: 'Response time',
        target: '< 100ms',
        measurement: 'API response time',
        priority: 'primary' as const,
      },
    ],
    outOfScope: [],
    constraints: [
      {
        type: 'technical' as const,
        description: 'Must use TypeScript',
      },
    ],
    integrations: [],
    phases: [
      {
        id: 'phase-1',
        name: 'Implementation',
        description: 'Build the feature',
        tasks: [
          {
            id: 'task-1',
            type: 'implement' as const,
            description: 'Implement feature',
            agentType: 'coder',
            files: ['src/feature.ts'],
            acceptanceCriteria: ['ac-1'],
            constraints: [],
            dependsOn: [],
          },
        ],
        parallel: false,
        dependencies: [],
        checkpointAfter: true,
      },
    ],
    checkpoints: [
      {
        id: 'cp-1',
        type: 'post-implementation' as const,
        phase: 'phase-1',
        required: true,
        autoApprove: false,
        description: 'Review implementation',
        artifactTypes: ['code'],
        questionsToAsk: ['Does it work?'],
      },
    ],
    acceptanceCriteria: [
      {
        id: 'ac-1',
        description: 'Feature works',
        given: 'a user request',
        when: 'they submit',
        then: 'it succeeds',
        priority: 'must-have' as const,
        testable: true,
        automatable: true,
      },
    ],
    testStrategy: {
      unitTests: true,
      integrationTests: true,
      e2eTests: false,
      coverageTarget: 80,
      notes: [],
    },
    estimatedCost: {
      totalTokens: 10000,
      estimatedCostUSD: 0.05,
      breakdown: { 'phase-1': 0.05 },
      confidence: 'high' as const,
    },
    estimatedDuration: {
      totalMinutes: 30,
      breakdown: { 'phase-1': 30 },
      parallelizable: 0,
      confidence: 'high' as const,
    },
    risks: [
      {
        id: 'risk-1',
        description: 'API failure',
        likelihood: 'low' as const,
        impact: 'medium' as const,
        mitigation: 'Add retry logic',
      },
    ],
    codebaseContext: {
      primaryLanguage: 'TypeScript',
      hasTypeScript: true,
      hasLinting: true,
      hasTests: true,
      testCoverage: {
        hasTests: true,
        testDirectories: ['tests'],
        testFileCount: 10,
      },
      entryPoints: ['src/index.ts'],
      codeConventions: {
        namingStyle: 'camelCase',
        fileStructure: 'feature-based',
        testPattern: '*.test.ts',
      },
      dependencies: {
        production: ['express'],
        development: ['vitest'],
      },
      architecture: {
        pattern: 'monolith',
        layers: ['api', 'service', 'data'],
        communicationStyle: 'synchronous',
      },
      riskAreas: [],
      maturityLevel: 'established' as const,
      relevantFiles: ['src/index.ts'],
    },
    readinessScore: 100,
    readinessIssues: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Validate Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete and Ready Spec', () => {
    it('should validate a complete spec with high score', async () => {
      const spec = createMockSpec();
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
      expect(result.recommendations).toContain('Specification is ready for execution');
    });

    it('should have no errors for well-formed spec', async () => {
      const spec = createMockSpec();
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const errors = result.issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  describe('Missing Required Fields', () => {
    it('should error when problem statement is missing', async () => {
      const spec = createMockSpec({ problem: '' });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const problemError = result.issues.find(
        i => i.field === 'problem' && i.severity === 'error'
      );
      expect(problemError).toBeDefined();
      expect(problemError?.message).toContain('missing or too brief');
      expect(result.score).toBeLessThan(100);
    });

    it('should error when problem statement is too short', async () => {
      const spec = createMockSpec({ problem: 'Short' });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const problemError = result.issues.find(i => i.field === 'problem');
      expect(problemError?.message).toContain('minimum 20 characters');
    });

    it('should error when success metrics are missing', async () => {
      const spec = createMockSpec({ successMetrics: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const metricsError = result.issues.find(
        i => i.field === 'successMetrics' && i.severity === 'error'
      );
      expect(metricsError?.message).toBe('No success metrics defined');
    });

    it('should error when acceptance criteria are missing', async () => {
      const spec = createMockSpec({ acceptanceCriteria: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const criteriaError = result.issues.find(
        i => i.field === 'acceptanceCriteria' && i.severity === 'error'
      );
      expect(criteriaError?.message).toBe('No acceptance criteria defined');
    });

    it('should error when phases are missing', async () => {
      const spec = createMockSpec({ phases: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const phasesError = result.issues.find(
        i => i.field === 'phases' && i.severity === 'error'
      );
      expect(phasesError?.message).toBe('No execution phases defined');
    });
  });

  describe('Warnings for Optional Fields', () => {
    it('should warn when user persona is missing', async () => {
      const spec = createMockSpec({ userPersona: '' });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const personaWarning = result.issues.find(
        i => i.field === 'userPersona' && i.severity === 'warning'
      );
      expect(personaWarning).toBeDefined();
      expect(personaWarning?.message).toContain('missing or too brief');
      expect(result.valid).toBe(true); // Still valid, just a warning
    });

    it('should warn when no primary success metric is defined', async () => {
      const spec = createMockSpec({
        successMetrics: [
          {
            name: 'Secondary metric',
            description: 'Not primary',
            target: 'Some target',
            measurement: 'How to measure',
            priority: 'secondary' as const,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const primaryWarning = result.issues.find(
        i => i.field === 'successMetrics' && i.severity === 'warning'
      );
      expect(primaryWarning?.message).toBe('No primary success metric defined');
    });

    it('should warn when acceptance criteria are not testable', async () => {
      const spec = createMockSpec({
        acceptanceCriteria: [
          {
            id: 'ac-1',
            description: 'Testable',
            given: 'a',
            when: 'b',
            then: 'c',
            priority: 'must-have' as const,
            testable: true,
            automatable: true,
          },
          {
            id: 'ac-2',
            description: 'Not testable',
            given: 'a',
            when: 'b',
            then: 'c',
            priority: 'must-have' as const,
            testable: false,
            automatable: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const testableWarning = result.issues.find(
        i => i.field === 'acceptanceCriteria' && i.severity === 'warning'
      );
      expect(testableWarning?.message).toContain('1 acceptance criteria are not testable');
    });

    it('should warn when checkpoints are missing', async () => {
      const spec = createMockSpec({ checkpoints: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const checkpointWarning = result.issues.find(
        i => i.field === 'checkpoints' && i.severity === 'warning'
      );
      expect(checkpointWarning?.message).toContain('No checkpoints defined');
      expect(result.recommendations).toContain('Add checkpoints for critical decisions');
    });

    it('should warn when risks are missing', async () => {
      const spec = createMockSpec({ risks: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const riskWarning = result.issues.find(
        i => i.field === 'risks' && i.severity === 'warning'
      );
      expect(riskWarning?.message).toBe('No risks identified');
      expect(result.recommendations).toContain('Identify potential risks and mitigations');
    });

    it('should warn when codebase context is missing', async () => {
      const spec = createMockSpec({ codebaseContext: undefined });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const contextWarning = result.issues.find(
        i => i.field === 'codebaseContext' && i.severity === 'warning'
      );
      expect(contextWarning?.message).toBe('No codebase context available');
      expect(result.recommendations).toContain('Run elenchus_analyze to understand the codebase');
    });

    it('should warn when phase has no tasks', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-1',
            name: 'Empty Phase',
            description: 'No tasks',
            tasks: [],
            parallel: false,
            dependencies: [],
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const tasksWarning = result.issues.find(
        i => i.field === 'phases.phase-1.tasks' && i.severity === 'warning'
      );
      expect(tasksWarning?.message).toContain('has no tasks');
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect circular dependencies A→B→C→A', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-a',
            name: 'Phase A',
            description: 'First phase',
            tasks: [],
            parallel: false,
            dependencies: ['phase-c'], // A depends on C
            checkpointAfter: false,
          },
          {
            id: 'phase-b',
            name: 'Phase B',
            description: 'Second phase',
            tasks: [],
            parallel: false,
            dependencies: ['phase-a'], // B depends on A
            checkpointAfter: false,
          },
          {
            id: 'phase-c',
            name: 'Phase C',
            description: 'Third phase',
            tasks: [],
            parallel: false,
            dependencies: ['phase-b'], // C depends on B (creates cycle)
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const circularError = result.issues.find(
        i => i.field === 'phases.dependencies' && i.message.includes('Circular dependency')
      );
      expect(circularError).toBeDefined();
      expect(circularError?.severity).toBe('error');
      expect(circularError?.message).toContain('Phase A → Phase C → Phase B → Phase A');
    });

    it('should detect self-referencing circular dependency A→A', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-a',
            name: 'Phase A',
            description: 'Self-referencing',
            tasks: [],
            parallel: false,
            dependencies: ['phase-a'], // Depends on itself
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const circularError = result.issues.find(
        i => i.message.includes('Circular dependency')
      );
      expect(circularError).toBeDefined();
    });

    it('should detect multiple circular dependencies', async () => {
      const spec = createMockSpec({
        phases: [
          // First cycle: A → B → A
          {
            id: 'phase-a',
            name: 'Phase A',
            description: 'Part of first cycle',
            tasks: [],
            parallel: false,
            dependencies: ['phase-b'],
            checkpointAfter: false,
          },
          {
            id: 'phase-b',
            name: 'Phase B',
            description: 'Part of first cycle',
            tasks: [],
            parallel: false,
            dependencies: ['phase-a'],
            checkpointAfter: false,
          },
          // Second cycle: C → D → C
          {
            id: 'phase-c',
            name: 'Phase C',
            description: 'Part of second cycle',
            tasks: [],
            parallel: false,
            dependencies: ['phase-d'],
            checkpointAfter: false,
          },
          {
            id: 'phase-d',
            name: 'Phase D',
            description: 'Part of second cycle',
            tasks: [],
            parallel: false,
            dependencies: ['phase-c'],
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const circularErrors = result.issues.filter(
        i => i.message.includes('Circular dependency')
      );
      expect(circularErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('should not flag valid dependency chain A→B→C', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-a',
            name: 'Phase A',
            description: 'First',
            tasks: [],
            parallel: false,
            dependencies: [],
            checkpointAfter: false,
          },
          {
            id: 'phase-b',
            name: 'Phase B',
            description: 'Second',
            tasks: [],
            parallel: false,
            dependencies: ['phase-a'],
            checkpointAfter: false,
          },
          {
            id: 'phase-c',
            name: 'Phase C',
            description: 'Third',
            tasks: [],
            parallel: false,
            dependencies: ['phase-b'],
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const circularErrors = result.issues.filter(
        i => i.message.includes('Circular dependency')
      );
      expect(circularErrors).toHaveLength(0);
    });
  });

  describe('Unknown Dependency Detection', () => {
    it('should error when phase depends on unknown phase', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            description: 'Valid phase',
            tasks: [],
            parallel: false,
            dependencies: ['unknown-phase'], // Unknown dependency
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const unknownError = result.issues.find(
        i => i.field === 'phases.phase-1.dependencies' && i.severity === 'error'
      );
      expect(unknownError?.message).toBe('Unknown dependency: unknown-phase');
    });

    it('should error for multiple unknown dependencies', async () => {
      const spec = createMockSpec({
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            description: 'Has multiple unknown deps',
            tasks: [],
            parallel: false,
            dependencies: ['unknown-1', 'unknown-2'],
            checkpointAfter: false,
          },
        ],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.valid).toBe(false);
      const unknownErrors = result.issues.filter(
        i => i.message.includes('Unknown dependency')
      );
      expect(unknownErrors.length).toBe(2);
    });
  });

  describe('Score Calculation', () => {
    it('should deduct points for missing problem statement', async () => {
      const spec = createMockSpec({ problem: '' });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      // Should deduct 15 points for missing problem
      expect(result.score).toBe(85);
    });

    it('should deduct points for multiple issues', async () => {
      const spec = createMockSpec({
        problem: '',
        successMetrics: [],
        acceptanceCriteria: [],
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      // Should deduct 15 + 15 + 15 = 45 points
      expect(result.score).toBe(55);
    });

    it('should not go below 0', async () => {
      const spec = createMockSpec({
        problem: '',
        successMetrics: [],
        acceptanceCriteria: [],
        phases: [],
        checkpoints: [],
        risks: [],
        codebaseContext: undefined,
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThan(50);
    });

    it('should maintain 100 score for perfect spec', async () => {
      const spec = createMockSpec();
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.score).toBe(100);
    });
  });

  describe('Recommendations Generation', () => {
    it('should recommend fixing errors before execution', async () => {
      const spec = createMockSpec({ problem: '' });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.recommendations).toContain('Fix all errors before proceeding to execution');
    });

    it('should recommend adding constraints when missing', async () => {
      const spec = createMockSpec({ constraints: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.recommendations).toContain(
        'Consider adding technical or business constraints'
      );
    });

    it('should recommend spec is ready when score is high', async () => {
      const spec = createMockSpec();
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.recommendations).toContain('Specification is ready for execution');
    });

    it('should recommend refining estimates when confidence is low', async () => {
      const spec = createMockSpec({
        estimatedCost: {
          totalTokens: 10000,
          estimatedCostUSD: 0.05,
          breakdown: {},
          confidence: 'low' as const,
        },
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      expect(result.recommendations).toContain('Refine estimates after research phase');
    });
  });

  describe('Info Level Issues', () => {
    it('should add info for missing constraints', async () => {
      const spec = createMockSpec({ constraints: [] });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const constraintsInfo = result.issues.find(
        i => i.field === 'constraints' && i.severity === 'info'
      );
      expect(constraintsInfo?.message).toBe('No constraints defined');
    });

    it('should add info for low confidence estimates', async () => {
      const spec = createMockSpec({
        estimatedCost: {
          totalTokens: 10000,
          estimatedCostUSD: 0.05,
          breakdown: {},
          confidence: 'low' as const,
        },
      });
      vi.mocked(mockStorage.getSpec).mockReturnValue(spec);

      const result = await handleValidate({ specId: 'spec-1' }, mockStorage);

      const estimateInfo = result.issues.find(
        i => i.field === 'estimatedCost' && i.severity === 'info'
      );
      expect(estimateInfo?.message).toContain('low confidence');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when spec is not found', async () => {
      vi.mocked(mockStorage.getSpec).mockReturnValue(null);

      await expect(
        handleValidate({ specId: 'nonexistent' }, mockStorage)
      ).rejects.toThrow('Specification not found: nonexistent');
    });

    it('should validate input schema', async () => {
      await expect(
        handleValidate({}, mockStorage)
      ).rejects.toThrow();
    });

    it('should validate specId is a string', async () => {
      await expect(
        handleValidate({ specId: 123 }, mockStorage)
      ).rejects.toThrow();
    });
  });
});
