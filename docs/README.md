# Elenchus Documentation Index

## Multi-Language Detection Research & Implementation

This directory contains comprehensive research, analysis, and implementation guidance for multi-language project detection in Elenchus.

---

## Quick Start

**New to this project?** Start here:
1. Read **[RESEARCH_SUMMARY.md](./RESEARCH_SUMMARY.md)** (5 min read) - Executive overview
2. Review **[DETECTION_REFERENCE.md](./DETECTION_REFERENCE.md)** (10 min) - Quick reference tables
3. Dive into **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)** (20 min) - Concrete tasks

---

## Document Guide

### 1. RESEARCH_SUMMARY.md
**Purpose**: Executive summary for decision makers
**Duration**: 5-10 minutes
**Contains**:
- Problem statement & solution overview
- Key findings (manifests, frameworks, tools)
- Implementation approach & architecture
- 3-phase roadmap at a glance
- Risk assessment & success metrics
- Next steps & questions answered

**Read if you want to**: Understand the big picture quickly

---

### 2. MULTI_LANGUAGE_DETECTION_ANALYSIS.md
**Purpose**: Deep technical analysis (developer reference)
**Duration**: 30-45 minutes
**Contains**:
- Current state analysis (what's broken)
- Architecture design for each language:
  - Python (pyproject.toml, test frameworks, type checkers, linters)
  - TypeScript (enhanced detection)
  - Go (go.mod parsing)
  - PHP (composer.json with performance optimization)
- Manifest parsing strategies (TOML, JSON, go.mod format)
- Framework detection maps (40+ frameworks)
- Edge cases & handling:
  - Polyglot repos
  - Monorepos
  - Missing/invalid manifests
  - Large repositories
- Testing strategy with fixtures
- Implementation priorities
- Success criteria

**Read if you want to**: Understand technical details, make architectural decisions

---

### 3. IMPLEMENTATION_ROADMAP.md
**Purpose**: Concrete task breakdown for implementation
**Duration**: 20-30 minutes
**Contains**:
- Quick reference: Key decisions table
- **Phase 1 (2-3 weeks): Python Detection**
  - 5 tasks with detailed checklists
  - Base detector class
  - Python detector implementation
  - TOML parsing
  - Integration with analyze.ts
  - Type definitions
  - Testing (fixtures & unit tests)
  - Documentation
- Phase 2 & 3 overview
- Success metrics by phase
- Risk mitigation strategies
- Complete file manifest
- Estimated timeline (5-6 weeks total)

**Read if you want to**: Start implementing, create GitHub issues, track progress

---

### 4. DETECTION_REFERENCE.md
**Purpose**: Quick lookup tables and decision matrices
**Duration**: 5-10 minutes (reference, not linear)
**Contains**:
- Language detection priority matrix
- Manifest files by language (with priority & parsing)
- Framework detection maps:
  - Python (web, ORM, validation, async)
  - TypeScript/JavaScript (frontend, backend, testing)
  - Go (web frameworks, RPC, testing)
  - PHP (web frameworks, testing, tools)
- Tool detection maps:
  - Test frameworks (pytest, jest, PHPUnit, ginkgo)
  - Type checkers (mypy, pyright, etc.)
  - Linters (ruff, eslint, golangci-lint, phpstan)
  - Package managers (uv, poetry, npm, go modules, composer)
- Dependency parsing examples
- Python package manager detection tree
- Confidence scoring algorithm
- Large repo handling thresholds
- Error handling decision matrix
- Performance targets
- Common mistake prevention (anti-patterns)
- Testing checklist

**Read if you want to**: Quick reference during implementation, lookup framework names

---

## Navigation by Role

### For Product Managers / Team Leads
1. RESEARCH_SUMMARY.md → Understand scope & timeline
2. IMPLEMENTATION_ROADMAP.md → Track progress → Success metrics

### For Architects / Technical Leads
1. RESEARCH_SUMMARY.md → Understand approach
2. MULTI_LANGUAGE_DETECTION_ANALYSIS.md → Review architecture
3. IMPLEMENTATION_ROADMAP.md → Approve task breakdown

### For Implementing Developers
1. RESEARCH_SUMMARY.md → Context (5 min)
2. IMPLEMENTATION_ROADMAP.md → Phase 1 tasks
3. MULTI_LANGUAGE_DETECTION_ANALYSIS.md → Reference for details
4. DETECTION_REFERENCE.md → During coding (lookup tables)

### For Code Reviewers
1. DETECTION_REFERENCE.md → Framework/tool names (validate against lists)
2. MULTI_LANGUAGE_DETECTION_ANALYSIS.md → Validate against spec
3. IMPLEMENTATION_ROADMAP.md → Check coverage against checklist

### For QA / Testers
1. IMPLEMENTATION_ROADMAP.md → Phase X testing section
2. MULTI_LANGUAGE_DETECTION_ANALYSIS.md → Edge cases section
3. DETECTION_REFERENCE.md → Testing checklist

---

## Key Artifacts in These Documents

### Code Examples
- Base detector class design
- Python detector implementation structure
- Framework detection maps
- Dependency parsing logic

### Test Fixtures
- Python projects (uv, poetry, legacy)
- Go projects
- PHP projects
- Polyglot monorepos

### Type Definitions
- `DetectionResult` interface
- `LanguageProfile` interface
- Enhanced `CodebaseContext`

### Checklists
- Phase 1 complete task checklist
- Testing checklist by language
- Integration test matrix

---

## By Topic

### If You Want to Know About...

**Python Detection**
- Problem: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § 3.1
- Solution: IMPLEMENTATION_ROADMAP.md § Phase 1, Task 1.1.2
- Reference: DETECTION_REFERENCE.md § Framework Detection Maps

**Performance for Large Repos**
- Analysis: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Edge Cases 5.4
- Optimization: IMPLEMENTATION_ROADMAP.md § Phase 3
- Reference: DETECTION_REFERENCE.md § Large Repository Handling

**Framework Detection Strategy**
- Deep dive: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Sections 3.1-3.4
- Maps: DETECTION_REFERENCE.md § Framework Detection Maps
- Examples: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Appendix A

**Polyglot Repo Handling**
- Design: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Section 2.2
- Edge case: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § 5.1
- Example: DETECTION_REFERENCE.md § Example Outputs

**Testing Strategy**
- Approach: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Section 6
- Fixtures: IMPLEMENTATION_ROADMAP.md § Phase 1, Task 1.4.1
- Checklist: DETECTION_REFERENCE.md § Testing Checklist

---

## Cross-Document References

### Manifest Files
- Defined in: DETECTION_REFERENCE.md § Manifest Files by Language
- Parsing in: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Sections 3.1-3.4
- Implementation: IMPLEMENTATION_ROADMAP.md § Tasks 1.1.2, 1.1.3

### Framework Detection Maps
- Comprehensive: DETECTION_REFERENCE.md § Framework Detection Maps
- Implementation details: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Sections 3.1-3.4
- Code structure: IMPLEMENTATION_ROADMAP.md § Task 1.1.2

### Performance Targets
- Analysis: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Section 8
- Reference: DETECTION_REFERENCE.md § Performance Targets
- Monitoring: IMPLEMENTATION_ROADMAP.md § Phase 3

### Error Handling
- Analysis: MULTI_LANGUAGE_DETECTION_ANALYSIS.md § Section 5
- Decision matrix: DETECTION_REFERENCE.md § Error Handling Decision Matrix
- Implementation: IMPLEMENTATION_ROADMAP.md § Task 1.1.2

---

## Document Statistics

| Document | Lines | Size | Focus |
|----------|-------|------|-------|
| RESEARCH_SUMMARY.md | 395 | 13 KB | Executive summary |
| DETECTION_REFERENCE.md | 554 | 13 KB | Quick reference |
| IMPLEMENTATION_ROADMAP.md | 855 | 23 KB | Task breakdown |
| MULTI_LANGUAGE_DETECTION_ANALYSIS.md | 1,287 | 35 KB | Technical depth |
| **Total** | **3,091** | **84 KB** | **Complete analysis** |

---

## Getting Started

### For Implementation

**Week 1:**
1. Read RESEARCH_SUMMARY.md (15 min)
2. Read IMPLEMENTATION_ROADMAP.md Phase 1 (20 min)
3. Review DETECTION_REFERENCE.md Python section (10 min)
4. Create GitHub issues from Phase 1 checklist
5. Start Task 1.1.1: Base detector class

**Weekly:**
- Reference IMPLEMENTATION_ROADMAP.md Phase X checklist
- Cross-reference DETECTION_REFERENCE.md for framework names
- Check details in MULTI_LANGUAGE_DETECTION_ANALYSIS.md as needed

### For Code Review

1. Check code against IMPLEMENTATION_ROADMAP.md checklist
2. Validate frameworks against DETECTION_REFERENCE.md maps
3. Verify error handling against MULTI_LANGUAGE_DETECTION_ANALYSIS.md § 5
4. Run through DETECTION_REFERENCE.md testing checklist

---

## What's Covered

✓ Python (priority 1) - detailed analysis
✓ TypeScript/JavaScript (maintain) - enhancement strategy
✓ Go (priority 2) - full analysis
✓ PHP (priority 2) - with performance optimization
✓ Polyglot projects - specific handling
✓ Monorepos - detection strategy
✓ Large repos - performance optimization
✓ Error cases - comprehensive coverage
✓ Testing - fixtures and strategy
✓ Implementation timeline - 5-6 weeks
✓ Architecture design - extensible plugin system

---

## What's Not Covered

- Runtime framework detection (via source code scanning) - intentionally excluded
- Non-declarative manifests - not applicable to primary languages
- Java, C#, Rust - future phases
- Exact AST parsing - too complex for MVP
- Pre-built binary analysis - out of scope

---

## Next Steps

1. **Review phase**: Stakeholders read RESEARCH_SUMMARY.md
2. **Approval phase**: Team approves Phase 1 approach
3. **Planning phase**: Create GitHub issues from IMPLEMENTATION_ROADMAP.md
4. **Execution phase**: Developers implement using ROADMAP.md and reference MULTI_LANGUAGE_DETECTION_ANALYSIS.md
5. **Verification phase**: QA uses DETECTION_REFERENCE.md testing checklist

---

## Questions?

- **What should I read first?** → RESEARCH_SUMMARY.md
- **Where do I start coding?** → IMPLEMENTATION_ROADMAP.md Phase 1, Task 1.1.1
- **What frameworks are detected?** → DETECTION_REFERENCE.md
- **How do I handle polyglot repos?** → MULTI_LANGUAGE_DETECTION_ANALYSIS.md § 5.1
- **What's the timeline?** → IMPLEMENTATION_ROADMAP.md § Timeline
- **What's the success criteria?** → IMPLEMENTATION_ROADMAP.md § Success Metrics

---

## Document Versions

| Document | Created | Updated | Status |
|----------|---------|---------|--------|
| RESEARCH_SUMMARY.md | 2026-01-24 | 2026-01-24 | Final |
| MULTI_LANGUAGE_DETECTION_ANALYSIS.md | 2026-01-24 | 2026-01-24 | Final |
| IMPLEMENTATION_ROADMAP.md | 2026-01-24 | 2026-01-24 | Final |
| DETECTION_REFERENCE.md | 2026-01-24 | 2026-01-24 | Final |
| README.md (this file) | 2026-01-24 | 2026-01-24 | Final |

---

## Summary

This research package provides everything needed to implement multi-language project detection in Elenchus:

- **Analysis**: Complete technical breakdown for Python, Go, PHP, TypeScript
- **Architecture**: Plugin-based detector system, manifest-first strategy
- **Implementation**: Concrete 3-phase roadmap with detailed tasks
- **Reference**: Quick lookup tables for frameworks, tools, manifests
- **Testing**: Comprehensive test strategy with fixtures and checklists
- **Timeline**: 5-6 weeks for 1 developer to complete all phases

**Ready to start**: Yes ✓
**Confidence level**: High (95%) ✓
**Next step**: Approve Phase 1, create GitHub issues, start development

