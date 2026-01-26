# Elenchus Documentation

## Overview

Elenchus implements **true Socratic elenchus** for software specification - not just Q&A tracking, but contradiction detection and forced resolution.

## Key Documents

| Document | Purpose |
|----------|---------|
| [../README.md](../README.md) | Quick start and usage |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | System design and data model |
| [socratic-method-research.md](./socratic-method-research.md) | Research on the Socratic method |
| [plan-smart-interrogation.md](./plan-smart-interrogation.md) | Design evolution and planning |

## The Core Insight

From [Augment Code's research](https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them):
- 41.77% of agent failures are specification problems
- 36.94% are coordination failures
- **78.71% of failures happen before code execution**

Elenchus addresses the specification problem through Socratic interrogation.

## Design Principles

1. **Claude is the intelligence. Elenchus is infrastructure.**
   - No regex for content understanding
   - No keyword matching for semantics
   - The calling LLM does all reasoning
   - Elenchus tracks state and enforces gates

2. **True Socratic elenchus**
   - Extract premises from answers
   - Detect contradictions between premises
   - Block progress until contradictions resolved

3. **Quality gates over presence checks**
   - Not "do we have an answer?" but "is the answer specific enough?"
   - Not "are areas covered?" but "do the answers contradict?"

## Architecture Summary

```
Epic → [elenchus_start] → Session + Signals
                            ↓
      [elenchus_qa] ← Q&A + Premises + Contradictions
            ↓
      Contradiction? → Challenge Question (Aporia)
            ↓
      readyForSpec? → [elenchus_spec]
```

## Historical Documents

The `/docs` folder contains research and design documents from the project's evolution:

- `socratic-method-research.md` - Research on applying Socratic method to software
- `gap-detection-algorithm.md` - Early approaches to detecting spec gaps
- `ADR-003-intelligent-interrogation-engine.md` - Architecture decision record
- `interrogation-engine-v2-spec.md` - Earlier iteration design

These are preserved for context but may not reflect the current implementation.
