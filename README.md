# CodeMender & Workload Identity Federation (WIF) Hands-On Lab (`lab/`)

This directory contains the complete hands-on lab, starter repository, remediated reference implementation, local dependency bundle, and architectural documentation for **Keyless Workload Identity Federation (WIF) with GitHub Actions & Autonomous Security Remediation via CodeMender**.

> **Target Audience**: Cloud Security Architects, Application Security Engineers, and DevSecOps Practitioners  
> **Execution Mode**: Live GitHub Actions CI/CD + Google Cloud Workload Identity Federation (WIF)  
> **Target Environment**: Google Cloud (`$PROJECT_ID`) & GitHub Actions  
> **Bilingual Counterpart**: [中文同步版 (README_CHN.md)](README_CHN.md)

> [!IMPORTANT]
> **Prerequisite — GCP Project ID Allowlist Registration**:
> Before starting this lab, **participants must submit their Google Cloud Project ID (`$PROJECT_ID`) in advance** so that the project can be allowlisted for **CodeMender and the Vertex AI Interactions API (`gemini-3.7-flash`) Preview**. Ensure you have received confirmation that your GCP Project ID is allowlisted before executing `cm find`, `cm verify`, or `cm fix`.

---

## 📚 Documentation & Report Index

| Document | English Version | Chinese Version (`_CHN.md`) | Description |
| :--- | :--- | :--- | :--- |
| **Hands-On Lab Guide** | [CODELAB.md](CODELAB.md) | [CODELAB_CHN.md](CODELAB_CHN.md) | End-to-end step-by-step guide: CI/CD Runner topology decision matrix, GCP Workload Identity Pool & GitHub OIDC Provider setup, `attribute.repository` least-privilege binding, solving the 3 pipeline `FIXME`s, local Inner Loop (`pre-commit` + Semgrep + `cm fix`), and Outer Loop autonomous PR validation on GitHub Actions. |
| **Architecture & Execution Summary** | [LAB_SUMMARY.md](LAB_SUMMARY.md) | [LAB_SUMMARY_CHN.md](LAB_SUMMARY_CHN.md) | Architecture sequence diagrams, WIF + OIDC token exchange flow, dual shift-left topology, operational gotchas (`--bypass-warning`, numeric `PROJECT_NUMBER`, `git diff HEAD`), and cleanup guide. |
| **Full-Stack Remediation Report** | [REMEDIATION_REPORT.md](REMEDIATION_REPORT.md) | [REMEDIATION_REPORT_CHN.md](REMEDIATION_REPORT_CHN.md) | Detailed root-cause analysis and patch walkthrough for all **16 security vulnerabilities** across API controllers, middlewares, services, repositories, and core utilities. |

---

## 📂 Complete Directory Structure & Local Lab Assets

All starter templates, reference solutions, Node.js `npm` dependencies, Semgrep rulesets, and GitHub Actions workflow plugins are included locally:

```text
lab/
├── README.md / README_CHN.md                        # Lab overview, prerequisites & navigation index
├── CODELAB.md / CODELAB_CHN.md                      # Complete step-by-step hands-on lab manual
├── LAB_SUMMARY.md / LAB_SUMMARY_CHN.md              # Architecture topology & troubleshooting guide
├── REMEDIATION_REPORT.md / REMEDIATION_REPORT_CHN.md# Analysis of all 16 vulnerabilities & patches
├── starter-repo/                                    # [Unpatched Starter Repo] For running the lab from scratch
│   ├── lab/
│   │   ├── hooks/ (install.sh, pre-commit)          # Local pre-commit hook using bundled Semgrep rules
│   │   ├── rules/p-javascript.yaml                  # Locally bundled Semgrep JavaScript ruleset
│   │   ├── scripts/semgrep-to-cm.py                 # Semgrep JSON -> CodeMender import converter
│   │   ├── templates/codemender-pipeline.template.yaml # Workflow template with 3 FIXMEs for learners
│   │   └── solutions/codemender-pipeline.solution.yaml # Reference workflow solution
│   ├── src/                                         # Vulnerable Node.js e-commerce API (16 intentional flaws)
│   ├── node_modules/                                # Pre-installed npm packages (56 packages)
│   └── package.json
├── remediated-repo/                                 # [Remediated Reference Repo] All 16 vulnerabilities patched
│   ├── .github/workflows/codemender-pipeline.yml    # Production-ready keyless WIF + CodeMender pipeline
│   ├── src/                                         # Fully hardened Node.js source code
│   └── node_modules/                                # Pre-installed npm packages
└── vendor/                                          # [Local Resource Bundle] Offline archives & dependencies
    ├── codemender-wif-lab-starter.tar.gz            # Complete standalone archive of starter-repo
    ├── npm-offline-cache/                           # 56 .tgz tarballs for express@4.18.2 & dependencies
    ├── semgrep-rules/p-javascript.yaml              # Semgrep JavaScript security ruleset (210 KB)
    ├── schemas/sarif-schema-2.1.0.json              # OASIS SARIF 2.1.0 JSON schema
    └── github-actions/                              # Reference archives of GitHub Actions used in CI
        ├── actions-checkout-v4.tar.gz
        ├── actions-upload-artifact-v4.tar.gz
        ├── google-github-actions-auth-v2.tar.gz
        └── peter-evans-create-pull-request-v6.tar.gz
```
