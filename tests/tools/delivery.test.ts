import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deliveryTool, handleDelivery } from '../../src/tools/delivery.js';
import type { Storage } from '../../src/storage/index.js';
import type { Specification } from '../../src/types/spec.js';
import type { Epic } from '../../src/types/epic.js';

describe('delivery tool', () => {
  describe('deliveryTool definition', () => {
    it('should have the correct name', () => {
      expect(deliveryTool.name).toBe('elenchus_delivery');
    });

    it('should have a description', () => {
      expect(deliveryTool.description).toBeTruthy();
      expect(deliveryTool.description).toContain('delivered');
    });

    it('should have required parameters', () => {
      const schema = deliveryTool.inputSchema as {
        required: string[];
        properties: Record<string, unknown>;
      };
      expect(schema.required).toContain('specId');
      expect(schema.required).toContain('artifacts');
      expect(schema.properties).toHaveProperty('specId');
      expect(schema.properties).toHaveProperty('artifacts');
      expect(schema.properties).toHaveProperty('notes');
      expect(schema.properties).toHaveProperty('knownLimitations');
    });
  });

  describe('handleDelivery', () => {
    let mockStorage: Storage;
    let mockSpec: Specification;
    let mockEpic: Epic;

    beforeEach(() => {
      mockEpic = {
        id: 'epic-123',
        title: 'Test Epic',
        description: 'Test epic description',
        source: 'text',
        status: 'active',
        extractedGoals: ['Goal 1'],
        extractedConstraints: [],
        extractedAcceptanceCriteria: [],
        extractedStakeholders: [],
        extractedTechStack: [],
        resources: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockSpec = {
        id: 'spec-456',
        epicId: 'epic-123',
        sessionId: 'session-789',
        version: 1,
        problem: 'Build a delivery tracking system',
        userPersona: 'Developer',
        successMetrics: [],
        outOfScope: [],
        constraints: [],
        integrations: [],
        phases: [
          {
            id: 'phase-1',
            name: 'Implementation',
            description: 'Implement the solution',
            tasks: [
              {
                id: 'task-1',
                type: 'implement',
                description: 'Build the feature',
                agentType: 'coder',
                files: [],
                acceptanceCriteria: [],
                constraints: [],
                dependsOn: [],
              },
            ],
            parallel: false,
            dependencies: [],
            checkpointAfter: false,
          },
        ],
        checkpoints: [],
        acceptanceCriteria: [],
        testStrategy: {
          unitTests: true,
          integrationTests: false,
          e2eTests: false,
          coverageTarget: 80,
          notes: [],
        },
        estimatedCost: {
          totalTokens: 100000,
          estimatedCostUSD: 1.0,
          breakdown: {},
          confidence: 'medium',
        },
        estimatedDuration: {
          totalMinutes: 60,
          breakdown: {},
          parallelizable: 0,
          confidence: 'medium',
        },
        risks: [],
        readinessScore: 85,
        readinessIssues: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockStorage = {
        getSpec: vi.fn().mockReturnValue(mockSpec),
        getEpic: vi.fn().mockReturnValue(mockEpic),
        saveDelivery: vi.fn(),
        listEpics: vi.fn(),
        getSessionsForEpic: vi.fn(),
        getLatestSpecForEpic: vi.fn(),
        getSession: vi.fn(),
        createEpic: vi.fn(),
        updateEpic: vi.fn(),
        createSession: vi.fn(),
        updateSession: vi.fn(),
        createSpec: vi.fn(),
        close: vi.fn(),
      } as unknown as Storage;
    });

    it('should create a delivery record with artifacts', async () => {
      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/delivery.ts',
              description: 'Delivery implementation',
            },
            {
              type: 'test',
              path: '/tests/delivery.test.ts',
              description: 'Delivery tests',
            },
          ],
        },
        mockStorage
      );

      expect(result.delivery).toBeDefined();
      expect(result.delivery.id).toMatch(/^delivery-/);
      expect(result.delivery.specId).toBe('spec-456');
      expect(result.delivery.epicId).toBe('epic-123');
      expect(result.delivery.artifacts).toHaveLength(2);
      expect(result.delivery.artifacts[0]).toEqual({
        type: 'code',
        path: '/src/delivery.ts',
        description: 'Delivery implementation',
      });
      expect(result.delivery.knownLimitations).toEqual([]);
      expect(result.delivery.specSummary).toBeDefined();
      expect(result.delivery.specSummary.id).toBe('spec-456');
    });

    it('should include notes when provided', async () => {
      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/feature.ts',
              description: 'Feature code',
            },
          ],
          notes: 'Used Claude Flow for execution. Changed approach from REST to GraphQL.',
        },
        mockStorage
      );

      expect(result.delivery.notes).toBe(
        'Used Claude Flow for execution. Changed approach from REST to GraphQL.'
      );
    });

    it('should include known limitations when provided', async () => {
      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/feature.ts',
              description: 'Feature code',
            },
          ],
          knownLimitations: [
            'No error handling for edge case X',
            'Performance not optimized',
          ],
        },
        mockStorage
      );

      expect(result.delivery.knownLimitations).toEqual([
        'No error handling for edge case X',
        'Performance not optimized',
      ]);
    });

    it('should create a delivery summary', async () => {
      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            { type: 'code', path: '/src/a.ts', description: 'A' },
            { type: 'code', path: '/src/b.ts', description: 'B' },
            { type: 'test', path: '/tests/test.ts', description: 'Tests' },
          ],
          notes: 'Implementation notes',
          knownLimitations: ['Limitation 1', 'Limitation 2'],
        },
        mockStorage
      );

      expect(result.summary).toBeDefined();
      expect(result.summary.id).toBe(result.delivery.id);
      expect(result.summary.specId).toBe('spec-456');
      expect(result.summary.epicId).toBe('epic-123');
      expect(result.summary.artifactCount).toBe(3);
      expect(result.summary.hasNotes).toBe(true);
      expect(result.summary.limitationCount).toBe(2);
      expect(result.summary.createdAt).toBeDefined();
    });

    it('should embed spec summary in delivery', async () => {
      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/feature.ts',
              description: 'Feature',
            },
          ],
        },
        mockStorage
      );

      const summary = result.delivery.specSummary;
      expect(summary.id).toBe('spec-456');
      expect(summary.epicId).toBe('epic-123');
      expect(summary.sessionId).toBe('session-789');
      expect(summary.version).toBe(1);
      expect(summary.problem).toBe('Build a delivery tracking system');
      expect(summary.readinessScore).toBe(85);
      expect(summary.phaseCount).toBe(1);
      expect(summary.taskCount).toBe(1);
      expect(summary.estimatedMinutes).toBe(60);
      expect(summary.estimatedCostUSD).toBe(1.0);
    });

    it('should truncate long problem statements in spec summary', async () => {
      mockSpec.problem = 'A'.repeat(300);

      const result = await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/feature.ts',
              description: 'Feature',
            },
          ],
        },
        mockStorage
      );

      expect(result.delivery.specSummary.problem).toHaveLength(200);
      expect(result.delivery.specSummary.problem).toMatch(/\.\.\.$/);
    });

    it('should save delivery to storage', async () => {
      await handleDelivery(
        {
          specId: 'spec-456',
          artifacts: [
            {
              type: 'code',
              path: '/src/feature.ts',
              description: 'Feature',
            },
          ],
        },
        mockStorage
      );

      expect(mockStorage.saveDelivery).toHaveBeenCalledOnce();
      const savedDelivery = (mockStorage.saveDelivery as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(savedDelivery.id).toMatch(/^delivery-/);
      expect(savedDelivery.specId).toBe('spec-456');
      expect(savedDelivery.epicId).toBe('epic-123');
    });

    it('should throw error if spec not found', async () => {
      (mockStorage.getSpec as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await expect(
        handleDelivery(
          {
            specId: 'nonexistent-spec',
            artifacts: [
              {
                type: 'code',
                path: '/src/feature.ts',
                description: 'Feature',
              },
            ],
          },
          mockStorage
        )
      ).rejects.toThrow('Specification not found: nonexistent-spec');
    });

    it('should throw error if epic not found', async () => {
      (mockStorage.getEpic as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await expect(
        handleDelivery(
          {
            specId: 'spec-456',
            artifacts: [
              {
                type: 'code',
                path: '/src/feature.ts',
                description: 'Feature',
              },
            ],
          },
          mockStorage
        )
      ).rejects.toThrow('Epic not found: epic-123');
    });

    it('should validate artifact types', async () => {
      await expect(
        handleDelivery(
          {
            specId: 'spec-456',
            artifacts: [
              {
                type: 'invalid-type',
                path: '/src/feature.ts',
                description: 'Feature',
              },
            ],
          },
          mockStorage
        )
      ).rejects.toThrow();
    });

    it('should require artifacts array', async () => {
      await expect(
        handleDelivery(
          {
            specId: 'spec-456',
          },
          mockStorage
        )
      ).rejects.toThrow();
    });

    it('should support all artifact types', async () => {
      const artifactTypes = ['code', 'test', 'docs', 'config', 'other'] as const;

      for (const type of artifactTypes) {
        const result = await handleDelivery(
          {
            specId: 'spec-456',
            artifacts: [
              {
                type,
                path: `/artifacts/${type}.txt`,
                description: `${type} artifact`,
              },
            ],
          },
          mockStorage
        );

        expect(result.delivery.artifacts[0]?.type).toBe(type);
      }
    });
  });
});
