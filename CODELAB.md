# Secure CI/CD with CodeMender & Workload Identity Federation

> **Source**: Google Cloud CodeMender & Workload Identity Federation (WIF) Hands-On Lab  
> **Topic**: Keyless Workload Identity Federation (WIF) with GitHub Actions & Autonomous Remediation via CodeMender  
> **Target Environment**: Google Cloud (`$PROJECT_ID`) & GitHub Actions  
> **Bilingual Counterpart**: [中文同步版 (CODELAB_CHN.md)](CODELAB_CHN.md)

---

## 1. Introduction

A hardcoded Service Account (SA) JSON key is a serious security risk. Engineers commit these keys to repositories, or store them as CI/CD secrets. An attacker with the key gets immediate access to your Google Cloud environment. **Workload Identity Federation (WIF)** removes this risk.

In this codelab, you build a WIF trust relationship between GitHub Actions and Google Cloud. You then write a pipeline that runs **CodeMender**, an autonomous security agent, against a vulnerable Node.js application.

> [!NOTE]
> **This is a build lab, not a copy-paste lab.** Most steps give you the objective, the parameters, and a verification command, but not the finished command line. Use `gcloud --help`, the documentation, or an AI assistant to find the syntax. The goal is to understand why each resource exists.

### What you will do:
- Decide if your runner topology needs WIF.
- Create your starter repository from a template.
- Build a Workload Identity Pool and an OIDC Provider that trusts only your repository.
- Apply attribute mapping to prevent the "confused deputy" vulnerability.
- **Complete a GitHub Actions pipeline.** You add the OIDC permission and the CodeMender flags.
- Run the **inner loop**: local Semgrep analysis and CodeMender remediation.
- Verify the **outer loop**: keyless authentication, semantic scanning, pull requests, and the security gate.

### What you need:
- A Google Cloud project with approved CodeMender access. Apply for access before this lab.
- A personal GitHub account.
- Basic knowledge of bash, YAML, and GitHub Actions.

---

## 2. Do You Actually Need Workload Identity Federation?

Not every CI/CD runner needs WIF. Unnecessary use adds configuration that you must maintain. Ask this question: *where does the runner run, and does it already have a Google Cloud identity?*

### The three common runner topologies

| Runner topology | Where it runs | How it gets credentials | Does it need WIF? |
| :--- | :--- | :--- | :--- |
| **Self-hosted on your own Google Cloud infrastructure** (GCE VM, GKE node, Cloud Run job) | Inside your Google Cloud project | The attached Service Account supplies Application Default Credentials (ADC) from the metadata server | **No.** The workload already has a Google Cloud identity. |
| **Self-hosted in your data centre or another cloud** | Outside Google Cloud, on infrastructure that you control | A WIF identity, or a static SA key file | **Yes.** WIF replaces the key file. |
| **Provider-managed** (GitHub-hosted, GitLab SaaS, GitHub Enterprise managed, GitLab Dedicated) | On temporary infrastructure that the CI/CD vendor owns | No Google Cloud identity. The provider issues a signed OIDC token. | **Yes. This is the primary WIF use case.** |

### Why the managed-runner case matters most

Many enterprise customers use **GitHub Enterprise Cloud** or **GitLab Dedicated** with managed private runners. These runners:
- Are temporary. You cannot install anything on the host in advance.
- Connect only to the customer VPC or IP allowlist, so they look private.
- Belong to the CI/CD vendor. They have **no Google Cloud identity**.

In the past, the only method was a Service Account JSON key in a CI/CD secret. That key has a long life, you can copy it, and it frequently has too many permissions. WIF removes the key. It exchanges the short-lived OIDC token of the runner for a short-lived Google Cloud access token, scoped to one repository.

> [!IMPORTANT]
> **A private runner is not a trusted identity.** Network isolation controls where the traffic comes from. WIF controls who the caller is. A managed private runner has no Google Cloud identity, whatever its network configuration, so it still needs WIF or a static key.

### What this lab uses

This lab uses **GitHub-hosted runners** (the third row of the table). Each step that you build applies directly to the enterprise managed-runner pattern.

*A question to keep in mind:* If you moved this pipeline to a self-hosted runner on a GCE VM in the same project, which steps could you delete? You answer this at the end of the lab.

---

## 3. Setup and Requirements

> [!WARNING]
> **Prerequisite**: Use a Google Cloud project with approved CodeMender access. In a project without access, CodeMender cannot call Gemini models on the Gemini Enterprise Agent Platform.

Run all terminal commands in Google Cloud Shell or a developer environment that contains `git`, `gh` (the GitHub CLI), and `gcloud`.

1. Set your active project and export the two variables:
   ```bash
   export PROJECT_ID="<YOUR_PROJECT_ID_HERE>"
   gcloud config set project ${PROJECT_ID}
   
   # Derive the project number rather than hardcoding it
   export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
   
   echo "Active Project ID:     ${PROJECT_ID}"
   echo "Active Project Number: ${PROJECT_NUMBER}"
   ```
   > **Why both?** IAM policy bindings use the **Project ID** (a text string). WIF `principalSet://` URIs use the **Project Number** (numeric). A mix-up of the two is the most common cause of a failed WIF binding.

2. Install and verify the CodeMender CLI (`cm`) per the [official setup guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/codemender/set-up-environment):
   ```bash
   curl -L -o cm-linux-amd64.zip "https://artifactregistry.googleapis.com/download/v1/projects/cmoc-prod/locations/us/repositories/codemender-cli-production/files/cm%3Astable%3Acm-linux-amd64.zip:download?alt=media"
   unzip -q -o cm-linux-amd64.zip
   chmod +x cm
   sudo mv cm /usr/local/bin/cm
   rm -f cm-linux-amd64.zip

   cm --version
   cm init
   ```

---

## 4. Initialize the GitHub Workspace

A template repository holds the vulnerable application, the Semgrep tools, and a **pipeline template**. No workflow is active in the template. The pipeline file is inactive and has three deliberate gaps, which you complete later.

### 1. Authenticate the GitHub CLI
```bash
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
```
1. Copy the one-time code printed by the terminal (e.g., `A1B2-C3D4`).
2. Open [https://github.com/login/device](https://github.com/login/device) in your browser.
3. Paste the code and authorize the GitHub CLI application.
4. If asked **Authenticate Git with your GitHub credentials?**, answer **Yes**.

Verify your work:
```bash
gh auth status
```
Confirm you are logged in and **Token scopes** includes `workflow`.

> **Why `--scopes workflow`?** By default, `gh auth login` requests only `repo`, `read:org`, and `gist`. Later you commit a file in `.github/workflows/`. A workflow file is executable code, so GitHub blocks any push without the `workflow` scope.

### 2. Create and clone the repository
```bash
# Initialize from the locally bundled starter-repo and push to your personal GitHub repository
cp -r ./starter-repo ./codemender-wif-lab
cd codemender-wif-lab
git init -b main
git add .
git commit -m "chore: initial starter template"
gh repo create codemender-wif-lab --public --source=. --remote=origin --push
```

### 3. Grant the pipeline permission to open pull requests
CodeMender opens a pull request when it finds vulnerabilities. Set the default workflow permissions to **write** and allow Actions to create and approve pull requests:
```bash
gh api -X PUT /repos/{owner}/{repo}/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```
*(Or navigate to `Settings > Actions > General > Workflow permissions` in the GitHub UI).*

Verify your work:
```bash
gh api /repos/{owner}/{repo}/actions/permissions/workflow
```
Expected output:
```json
{
  "default_workflow_permissions": "write",
  "can_approve_pull_request_reviews": true
}
```
> [!IMPORTANT]
> `can_approve_pull_request_reviews` is `false` by default. If it stays `false`, the pipeline works until the final step, which fails with `GitHub Actions is not permitted to create or approve pull requests`.

---

## 5. Enable Google Cloud Services

Export the variables that describe your GitHub identity:
```bash
export GITHUB_USERNAME=$(gh api user --jq .login)
export GITHUB_REPO="codemender-wif-lab"
export GITHUB_REPO_FULL="${GITHUB_USERNAME}/${GITHUB_REPO}"

export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

echo "GitHub repo:    ${GITHUB_REPO_FULL}"
echo "Project ID:     ${PROJECT_ID}"
echo "Project Number: ${PROJECT_NUMBER}"
```

Enable required APIs:
```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  aiplatform.googleapis.com \
  serviceusage.googleapis.com
```

| API | What breaks without it |
| :--- | :--- |
| `iam.googleapis.com` | Cannot create pool, provider, or Service Account |
| `iamcredentials.googleapis.com` | OIDC token exchange fails (creates the short-lived token) |
| `cloudresourcemanager.googleapis.com` | Project-level IAM policy bindings fail |
| `aiplatform.googleapis.com` | CodeMender cannot call Gemini models |
| `serviceusage.googleapis.com` | Quota attribution to your project fails |

Verify:
```bash
gcloud services list --enabled \
  --filter="name:(iam.googleapis.com OR iamcredentials.googleapis.com OR cloudresourcemanager.googleapis.com OR aiplatform.googleapis.com OR serviceusage.googleapis.com)"
```

---

## 6. Establish the Workload Identity Pool

Workload Identity Federation lets an external identity impersonate a Google Cloud Service Account without a static key.

### Task A: Create the Workload Identity Pool
- **Pool ID**: `github-actions`
- **Location**: `global`
- **Display name**: `GitHub Actions Pool`

```bash
gcloud iam workload-identity-pools create github-actions \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="${PROJECT_ID}"
```

### Task B: Add a GitHub OIDC Provider to the pool
- **Provider ID**: `github-oidc`
- **Parent pool**: `github-actions`
- **Location**: `global`
- **Issuer URI**: `https://token.actions.githubusercontent.com`
- **Attribute mapping**:
  - `google.subject` = `assertion.sub`
  - `attribute.repository` = `assertion.repository`
- **Attribute condition**: `assertion.repository_owner == '${GITHUB_USERNAME}'`

```bash
gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_USERNAME}'" \
  --project="${PROJECT_ID}"
```

> **Why use both a mapping and a condition?** Every GitHub user shares the issuer `token.actions.githubusercontent.com`. Without a condition, any GitHub Actions workflow across the world can send a valid token to your pool. The `repository_owner` condition is your first boundary; the `attribute.repository` mapping provides the second, tighter boundary at the IAM layer.

Verify your work:
```bash
gcloud iam workload-identity-pools providers describe github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --project="${PROJECT_ID}"
```

---

## 7. Provision the Service Account Identity

### Task A: Create the Service Account
- **Account ID**: `codemender-ci`
- **Display name**: `CodeMender CI Runner`

```bash
gcloud iam service-accounts create codemender-ci \
  --display-name="CodeMender CI Runner" \
  --project="${PROJECT_ID}"
```

### Task B: Grant Project-Level Roles
Grant the two roles CodeMender needs:
1. `roles/aiplatform.user` (Call Gemini models on Gemini Enterprise Agent Platform)
2. `roles/serviceusage.serviceUsageConsumer` (Attribute API quota to your project)

```bash
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

### Task C: Bind Federated Identity to the Service Account
Grant `roles/iam.workloadIdentityUser` **on the Service Account** (not on the project) to a `principalSet://` member scoped to your repository only:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/attribute.repository/${GITHUB_REPO_FULL}"
```

> [!CAUTION]
> **Bind to the repository, not the pool.** Do not bind to the full pool (`.../workloadIdentityPools/github-actions/*`). Every repository that you own could then use this SA. Scope explicitly to `attribute.repository/${GITHUB_REPO_FULL}`.

Verify:
```bash
gcloud iam service-accounts get-iam-policy \
  codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com
```

---

## 8. Configure GitHub Actions Variables

Set three repository variables:
1. `GCP_WIF_PROVIDER`: Full resource path of the OIDC provider (`projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/providers/github-oidc`)
2. `GCP_SA_EMAIL`: `codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com`
3. `GCP_QUOTA_PROJECT`: `${PROJECT_ID}`

```bash
WIF_PROVIDER_NAME=$(gcloud iam workload-identity-pools providers describe github-oidc \
  --workload-identity-pool="github-actions" \
  --location="global" \
  --project="${PROJECT_ID}" \
  --format="value(name)")

gh variable set GCP_WIF_PROVIDER --body "${WIF_PROVIDER_NAME}"
gh variable set GCP_SA_EMAIL --body "codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com"
gh variable set GCP_QUOTA_PROJECT --body "${PROJECT_ID}"
```

Verify:
```bash
gh variable list
```

---

## 9. Complete the CodeMender Pipeline

Move the pipeline template into `.github/workflows/`:
```bash
mkdir -p .github/workflows
cp lab/templates/codemender-pipeline.template.yaml .github/workflows/codemender-pipeline.yml
```

Complete the **three missing gaps (FIXMEs)** in `.github/workflows/codemender-pipeline.yml`:

### FIXME 1: OIDC Token Permission
Add `id-token: write` under `permissions:`:
```yaml
permissions:
  contents: write          # push the remediation branch
  pull-requests: write     # open the autonomous remediation PR
  id-token: write          # mint the GitHub OIDC token WIF exchanges for GCP creds
```

### FIXME 2: CodeMender Autonomous Scan Flags
In the `CodeMender Scan` step, replace `FLAGS_GO_HERE` with `-y --model "$CM_MODEL"`:
```yaml
      - name: CodeMender Scan
        id: scan
        run: |
          cm find "$SCAN_PATH" --sandbox=false -y --model "$CM_MODEL" 2>&1 | tee "$RUNNER_TEMP/cm-find.cm.log"
```

### FIXME 3: CodeMender Autonomous Fix Flags
In the `Verify and Remediate` loop, replace `FLAGS_GO_HERE` on `cm fix` with `-y --bypass-warning --model "$CM_MODEL"`:
```yaml
            yes | cm fix "$FID" --sandbox=false -y --bypass-warning --model "$CM_MODEL" 2>&1 | tee "$RUNNER_TEMP/fix-$FID.cm.log" || true
```

### CodeMender Command & Flag Reference

| Command / Flag | Purpose / Effect | When you need it |
| :--- | :--- | :--- |
| `cm init` | Creates `.codemender/` workspace and findings database | Pipeline initialization |
| `cm find <path>` | Runs agentic discovery and records findings | Read-only scan step |
| `cm verify <id>` | Writes and executes real exploit in `.exploit/` to verify bug | Verification step |
| `cm fix <id>` | Builds and applies verified remediation patch | Remediation step |
| `-y` | Answers per-action confirmation prompts | Always in CI |
| `--bypass-warning` | Acknowledges warning that agent runs commands and edits files (`-y` does NOT cover this!) | Mandatory on `cm verify` and `cm fix` in CI |
| `--sandbox=false` | Disables OS network namespace `sbox` on Ubuntu 24.04+ runners while keeping `project_paths` boundaries | Recommended on Cloud Shell / GitHub Actions `ubuntu-latest` |
| `--model <name>` | Pins Gemini model (e.g. `gemini-3.7-flash`) | Ensures consistent behavior & latency |

### Validate and Commit
```bash
# Validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/codemender-pipeline.yml')); print('YAML OK')"

# Verify all placeholders resolved (ignoring YAML comments)
if grep -v '^[[:space:]]*#' .github/workflows/codemender-pipeline.yml | grep -q "FLAGS_GO_HERE"; then
  echo "FLAGS_GO_HERE placeholder is still present"
elif ! grep -q "id-token: write" .github/workflows/codemender-pipeline.yml; then
  echo "Missing id-token: write permission under permissions:"
else
  echo "All three pipeline gaps resolved"
fi

# Commit (do NOT push yet)
git add .github/workflows/codemender-pipeline.yml
git commit -m "ci: add CodeMender security guardrail pipeline"
```

---

## 10. Local Shift-Left Remediation (Inner Loop)

Before pushing, understand how developers find and fix security issues locally.

1. **Install Semgrep and activate pre-commit hook**:
   ```bash
   pip install --quiet semgrep
   ./lab/hooks/install.sh
   ```

2. **Configure CodeMender**:
   ```bash
   cm init || true
   
   for CONFIG in "$HOME/.codemender/config.yaml" "$(pwd)/.codemender/config.yaml"; do
     mkdir -p "$(dirname "$CONFIG")"
     touch "$CONFIG"
     if ! grep -q '^project_paths:' "$CONFIG" 2>/dev/null; then
       printf '\nproject_paths:\n  - "%s"\n' "$(pwd)" >> "$CONFIG"
     fi
     sed -i 's/type: ""/type: "git"/' "$CONFIG" 2>/dev/null || true
     if ! grep -q 'type: "git"' "$CONFIG" 2>/dev/null && ! grep -q 'type: git' "$CONFIG" 2>/dev/null; then
       printf '\nvcs:\n  type: git\n' >> "$CONFIG"
     fi
     if ! grep -q '  - lab' "$CONFIG" 2>/dev/null; then
       sed -i 's/  - node_modules/  - node_modules\n  - lab\n  - .github/' "$CONFIG" 2>/dev/null || true
     fi
   done
   ```

3. **Run local Semgrep scan and convert format**:
   ```bash
   semgrep scan --config=lab/rules/p-javascript.yaml --json -o /tmp/semgrep.json src/
   python3 lab/scripts/semgrep-to-cm.py /tmp/semgrep.json -o /tmp/cm-findings.json
   ```

4. **Import findings and view report**:
   ```bash
   cm report import -f /tmp/cm-findings.json -p .
   cm report
   ```
   Findings shown:
   - `src/api/controllers/admin.controller.js` (HIGH severity: dynamic `eval`)
   - `src/api/controllers/order.controller.js` (MEDIUM severity: `res.sendFile` path traversal)

5. **Fix ONLY the HIGH severity finding** (leave MEDIUM for outer loop):
   ```bash
   yes | cm fix <HIGH_FINDING_ID> -y --bypass-warning --sandbox=false \
     --context "Focus on src/api/controllers/admin.controller.js. Fix the dynamic eval by validating or parsing the expression."
   
   git add src/api/controllers/admin.controller.js
   git commit -m "fix(security): sanitize dynamic eval in admin.controller.js"
   ```

6. **Verify and Push**:
   ```bash
   semgrep scan --config=lab/rules/p-javascript.yaml src/
   # Shows only 1 finding (MEDIUM path traversal). HIGH is gone.
   
   cm stats </dev/null
   git push origin main
   ```

---

## 11. Verify Autonomous CI/CD Pipeline (Outer Loop)

Open the **Actions** tab in GitHub and inspect the running workflow:

1. **Authenticate to Google Cloud**: Confirm OIDC token is exchanged for GCP token via WIF. Zero JSON keys.
2. **Install CodeMender CLI**: Downloaded directly from the official Google Cloud Artifact Registry endpoint.
3. **CodeMender Scan**: Agent scans `src/services/` with `gemini-3.7-flash`, uncovering semantic flaws (RCE in `admin.service.js`, SSRF in `catalog.service.js`, TOCTOU in `checkout.service.js`).
4. **Verify and Remediate**: Real exploit executed in `.exploit/`, returning `VERIFIED`. Patch applied.
5. **Pull Request**: Autonomous PR opened with title *CodeMender: autonomous security remediation*.
6. **Security Gate**: Job fails as expected due to remaining unpatched HIGH/CRITICAL findings.
7. **HTML Report Artifact**: Download `codemender-html-report.zip` to view full findings, exploit logs, and patch diffs.

### Troubleshooting Common Symptoms

| Symptom | Most Likely Cause | Resolution |
| :--- | :--- | :--- |
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL` | Missing `id-token: write` in `permissions:` | Add `id-token: write` under `permissions:` |
| `Permission denied on resource ... workloadIdentityPools` | `principalSet://` URI uses Project ID instead of numeric Project Number | Update binding to use numeric `${PROJECT_NUMBER}` |
| `The caller does not have permission` on SA | `roles/iam.workloadIdentityUser` bound at project level or wrong scope | Bind directly onto the `codemender-ci` SA resource |
| `unauthorized_client` during token exchange | Attribute condition mismatch (e.g. username casing) | Re-verify `assertion.repository_owner == '${GITHUB_USERNAME}'` exact casing |
| `GitHub Actions is not permitted to create or approve PRs` | `can_approve_pull_request_reviews` is `false` | Run `gh api -X PUT /repos/.../actions/permissions/workflow -F can_approve_pull_request_reviews=true` |
| `warning not acknowledged` | Missing `--bypass-warning` on `cm verify` or `cm fix` | Add `--bypass-warning` flag (`-y` alone does not cover this) |

---

## 12. Clean Up

```bash
# Delete WIF pool (also removes provider inside it)
gcloud iam workload-identity-pools delete github-actions \
  --location="global" \
  --project="${PROJECT_ID}" \
  --quiet

# Delete Service Account
gcloud iam service-accounts delete codemender-ci@${PROJECT_ID}.iam.gserviceaccount.com \
  --project="${PROJECT_ID}" \
  --quiet
```
*(Note: Workload Identity Pool deletion is a soft-delete reserved for 30 days).*
